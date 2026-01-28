"""
Scraper Service

Handles recursive URL scraping and content extraction for the URL Thing.
Supports converting HTML to Markdown for consistent storage and display.

PEP 8 Compliant
"""
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from typing import Dict, Set, List, Optional
from sqlalchemy.orm import Session
import time
import re

class ScraperService:
    def __init__(self):
        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": self.user_agent})

    def is_internal_link(self, base_url: str, target_url: str) -> bool:
        """
        Check if a URL is internal to the base domain.
        Allows subdomains (e.g. docs.example.com) and handles 'www.' inconsistencies.
        """
        parsed_target = urlparse(target_url)
        
        # Skip external schemes like mailto, tel, etc.
        if parsed_target.scheme and parsed_target.scheme not in ['http', 'https']:
            return False
            
        base_domain = urlparse(base_url).netloc.lower()
        target_domain = parsed_target.netloc.lower()
        
        # Absolute links to same domain OR relative links (empty netloc)
        if (target_domain == base_domain) or not target_domain:
            return True
            
        # Allow subdomains
        # We strip 'www.' from both for better matching
        clean_base = base_domain.replace('www.', '')
        clean_target = target_domain.replace('www.', '')
        
        # If the target is the same as base (after stripping www) 
        # or if it's a subdomain (ends with .base_domain)
        if (clean_target == clean_base or 
            clean_target.endswith('.' + clean_base)):
            return True
                
        return False

    def normalize_url(self, url: str) -> str:
        """
        Standardize URL format for consistent lookup.
        Preserves query strings as they are often required for content/downloads.
        """
        if not url:
            return ""
            
        # Standardize if it's already a full URL
        if url.startswith(('http://', 'https://')):
            parsed = urlparse(url)
            scheme = parsed.scheme.lower()
            netloc = parsed.netloc.lower()
            path = parsed.path.rstrip('/')
            if not path:
                path = ""
            
            query = f"?{parsed.query}" if parsed.query else ""
            normalized = f"{scheme}://{netloc}{path}{query}"
            return normalized
            
        return url

    def scrape_recursive(
        self, 
        root_url: str, 
        max_depth: int = 0, 
        max_pages: int = 50,
        db: Optional[Session] = None,
        user_id: Optional[int] = None,
        progress_callback: Optional[callable] = None,
        check_cancel: Optional[callable] = None
    ) -> Dict[str, str]:
        """
        Recursively scrape a URL up to a certain depth.
        Returns a dictionary mapping URLs to their markdown content or PDF asset IDs.
        """
        pages = {}
        visited = set()
        
        # Start with the normalized version of provided root URL
        root_normalized = self.normalize_url(root_url)
        queue = [(root_normalized, 0)]

        print(f"[ScraperService] Starting recursive scrape for {root_url} (depth={max_depth}, limit={max_pages})")

        while queue and len(pages) < max_pages:
            # Check for cancellation
            if check_cancel and check_cancel():
                print(f"[ScraperService] Scrape cancelled for {root_url}")
                break

            url, depth = queue.pop(0)

            if url in visited:
                continue

            visited.add(url)

            # Inform progress callback
            if progress_callback:
                progress_callback(url, len(pages), max_pages)

            # Skip non-scrappable schemes (just in case they got through)
            parsed = urlparse(url)
            if parsed.scheme and parsed.scheme not in ['http', 'https']:
                print(f"[ScraperService] Skipping non-HTTP link: {url}")
                visited.add(url)
                continue

            try:
                print(f"[ScraperService] Scraping ({len(pages)+1}/{max_pages}): {url} (Depth: {depth})")
                response = self.session.get(url, timeout=15, allow_redirects=True)
                response.raise_for_status()
                
                content_type = response.headers.get("Content-Type", "").lower()
                final_normalized = self.normalize_url(response.url)

                # PDF Handling - Improved detection
                is_pdf = "application/pdf" in content_type
                if not is_pdf and "application/octet-stream" in content_type:
                    # Fallback to extension check if content-type is generic
                    if url.lower().endswith(".pdf") or response.url.lower().endswith(".pdf"):
                        is_pdf = True
                
                if is_pdf and db and user_id:
                    print(f"[ScraperService] Detected PDF: {url}")
                    from app.services.asset_service import asset_service
                    filename = url.split("/")[-1] or "document.pdf"
                    if not filename.endswith(".pdf"):
                        filename += ".pdf"
                    
                    asset, _ = asset_service.create_asset_from_bytes(
                        db=db,
                        content=response.content,
                        filename=filename,
                        content_type="application/pdf",
                        user_id=user_id
                    )
                    
                    pages[final_normalized] = f"__PDF_ASSET__:{asset.id}"
                    if final_normalized != url:
                        pages[url] = f"__PDF_ASSET__:{asset.id}"
                    
                    # Don't recurse on PDFs
                    continue

                if "text/html" not in content_type:
                    print(f"[ScraperService] Skipping non-HTML/PDF content: {url} ({content_type})")
                    continue

                html = response.text
                soup = BeautifulSoup(html, "html.parser")

                # Remove noise
                for script in soup(["script", "style", "nav", "footer", "header", "aside"]):
                    script.decompose()

                # Convert to Markdown (simple version)
                content = self.html_to_markdown(soup, final_normalized)
                pages[final_normalized] = content
                
                # If the original URL we requested was different from the final one, 
                # also map the original one to the same content in case of external hits
                if final_normalized != url:
                    pages[url] = content

                # Find internal links if we haven't reached max depth
                if depth < max_depth:
                    for link in soup.find_all("a", href=True):
                        href = link["href"]
                        full_normalized = self.normalize_url(urljoin(final_normalized, href))
                        
                        if (self.is_internal_link(root_normalized, full_normalized) and 
                            full_normalized not in visited and 
                            full_normalized not in [q[0] for q in queue]):
                            queue.append((full_normalized, depth + 1))

                # Rate limiting
                time.sleep(0.5)

            except Exception as e:
                print(f"[ScraperService] Error scraping {url}: {e}")
                pages[url] = f"# Error Scraping Page\n\nFailed to fetch content: {str(e)}"

        return pages

    def html_to_markdown(self, soup: BeautifulSoup, base_url: str) -> str:
        """
        Converts a BeautifulSoup object to a reasonably clean Markdown string.
        """
        # Try to find the main content area with more robust selectors
        # Organized from largest containers to individual modules
        main_selectors = [
            "main", "[role='main']", "#content", "#main-content", 
            ".main-column", "article", ".content", 
            ".mod-paragraph", ".mod-standard", ".mod-text"
        ]
        
        target_blocks = []
        for selector in main_selectors:
            matches = soup.select(selector)
            if matches:
                # If we find a major container, we only want the first one 
                # (to avoid sidebars that might be in secondary containers)
                if selector in ["main", "[role='main']", "#content", "#main-content", ".main-column"]:
                    target_blocks = [matches[0]]
                else:
                    # For modular selectors, collect all matches
                    target_blocks = matches
                break
        
        if not target_blocks:
            target_blocks = [soup.body or soup]

        markdown = []
        
        # Title
        title = soup.title.string if soup.title else "Untitled Page"
        markdown.append(f"# {title.strip()}\n")
        markdown.append(f"Source: [{base_url}]({base_url})\n\n---\n\n")

        # Define headers we care about
        header_tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
        
        def process_element_text(elem):
            """Helper to extract text from an element while preserving links."""
            if not elem:
                return ""
            
            parts = []
            for child in elem.children:
                if isinstance(child, str):
                    parts.append(child.strip())
                elif child.name == 'a' and child.has_attr('href'):
                    href = child['href']
                    full_url = self.normalize_url(urljoin(base_url, href))
                    text = child.get_text().strip()
                    if text:
                        parts.append(f"[{text}]({full_url})")
                elif child.name == 'img' and (child.has_attr('alt') or child.has_attr('src')):
                    alt = child.get('alt', 'Image').strip()
                    parts.append(f"![{alt}]({urljoin(base_url, child.get('src', ''))})")
                elif child.name in ['strong', 'b', 'span', 'em', 'i', 'code']:
                    # Recursive call for nested formatting, but simplified for now
                    parts.append(child.get_text().strip())
                else:
                    # Generic text fallback for other tags
                    text = child.get_text().strip()
                    if text:
                        parts.append(text)
            
            return " ".join([p for p in parts if p])

        # Process each block
        for block in target_blocks:
            for elem in block.find_all(header_tags + ['p', 'ul', 'ol', 'pre', 'blockquote', 'a', 'table', 'img']):
                # Headers
                if elem.name in header_tags:
                    level = elem.name[1]
                    markdown.append(f"{'#' * int(level)} {elem.get_text().strip()}\n\n")
                
                # Paragraphs
                elif elem.name == 'p':
                    text = process_element_text(elem)
                    if text:
                        markdown.append(f"{text}\n\n")
                
                # Lists
                elif elem.name == 'ul' or elem.name == 'ol':
                    items = elem.find_all('li', recursive=False)
                    for i, li in enumerate(items):
                        li_text = process_element_text(li)
                        if li_text:
                            prefix = "- " if elem.name == 'ul' else f"{i+1}. "
                            markdown.append(f"{prefix}{li_text}\n")
                    if items:
                        markdown.append("\n")
                
                # Code/Pre
                elif elem.name == 'pre' or elem.name == 'code':
                    markdown.append(f"```\n{elem.get_text()}\n```\n\n")
                
                # Quote
                elif elem.name == 'blockquote':
                    markdown.append(f"> {elem.get_text().strip()}\n\n")
                    
                # Tables
                elif elem.name == 'table':
                    rows = elem.find_all('tr')
                    if not rows:
                        continue
                        
                    markdown.append("\n")
                    for i, row in enumerate(rows):
                        cols = row.find_all(['td', 'th'])
                        col_texts = [process_element_text(c).replace("|", "\\|") for c in cols]
                        markdown.append(f"| {' | '.join(col_texts)} |\n")
                        
                        if i == 0:
                            markdown.append(f"| {' | '.join(['---'] * len(cols))} |\n")
                    markdown.append("\n")

                # Image
                elif elem.name == 'img' and not elem.find_parents('p'):
                    alt = elem.get('alt', 'Image').strip()
                    markdown.append(f"![{alt}]({urljoin(base_url, elem.get('src', ''))})\n\n")

                # Standalone links
                elif elem.name == 'a' and not elem.find_parents(['p', 'li', 'td', 'th']):
                    href = elem.get('href')
                    if href:
                        full_url = self.normalize_url(urljoin(base_url, href))
                        text = elem.get_text().strip()
                        if text:
                            markdown.append(f"[{text}]({full_url})\n\n")
            
            # Add separator between blocks if multiple blocks are combined
            if len(target_blocks) > 1:
                markdown.append("\n---\n\n")

        return "".join(markdown)

scraper_service = ScraperService()
