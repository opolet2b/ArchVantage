import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from typing import Set, List, Dict, Any
from app.utils.document_parser import document_parser
import tempfile

class WebCrawlerService:
    """
    Service to recursively crawl web URLs up to a certain depth.
    """

    def crawl_url(self, base_url: str, max_depth: int = 1) -> str:
        """
        Crawls a URL recursively and returns the concatenated text content.
        """
        visited: Set[str] = set()
        domain = urlparse(base_url).netloc
        accumulated_text = ""

        # Common headers to avoid being blocked
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

        # Recursive helper
        def _crawl(url: str, current_depth: int):
            if current_depth > max_depth or url in visited:
                return ""

            visited.add(url)
            print(f"[WebCrawler] Visiting depth {current_depth}: {url}")
            
            nonlocal accumulated_text
            content_type = ""
            
            try:
                response = requests.get(url, timeout=15, stream=True, headers=headers)
                print(f"[WebCrawler] Status: {response.status_code} for {url}")
                response.raise_for_status()
                content_type = response.headers.get('Content-Type', '').lower()
                print(f"[WebCrawler] Content-Type: {content_type}")
                
                # Check extension if content-type is generic
                path = urlparse(url).path
                ext = os.path.splitext(path)[1].lower()

                # Handle non-HTML files (PDF, DOCX, etc.)
                if "application/pdf" in content_type or ext == ".pdf" or \
                   "application/vnd.openxmlformats-officedocument" in content_type or \
                   ext in [".docx", ".pptx", ".xlsx"]:
                    
                    print(f"[WebCrawler] Detected binary file: {url}")
                    # Download to a temporary file and parse
                    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                        for chunk in response.iter_content(chunk_size=8192):
                            tmp.write(chunk)
                        tmp_path = tmp.name
                    
                    try:
                        text = document_parser.extract_text_from_file(tmp_path, char_limit=40000)
                        if text:
                            print(f"[WebCrawler] Extracted {len(text)} chars from binary: {url}")
                            accumulated_text += f"\nSOURCE_URL: {url}\n{text}\n"
                    finally:
                        if os.path.exists(tmp_path):
                            os.remove(tmp_path)
                    
                    return # Don't look for links in binary files

                # Handle HTML
                if "text/html" in content_type:
                    soup = BeautifulSoup(response.text, "html.parser")
                    
                    # 1. First, find all links BEFORE we strip navigation/sidebars
                    extracted_links = []
                    if current_depth < max_depth:
                        extracted_links = soup.find_all("a", href=True)
                        print(f"[WebCrawler] Found {len(extracted_links)} links on {url} (before cleaning)")
                    
                    # 2. Now remove boilerplate to get purer text for the LLM
                    for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
                        element.extract()
                        
                    text = soup.get_text(separator="\n", strip=True)
                    if text:
                        print(f"[WebCrawler] Extracted {len(text)} chars from HTML: {url}")
                        accumulated_text += f"\nSOURCE_URL: {url}\n{text}\n"

                    # 3. Follow the links we found
                    if current_depth < max_depth:
                        for link in extracted_links:
                            next_url = urljoin(url, link["href"])
                            parsed_next = urlparse(next_url)
                            
                            # Stay within same domain OR allow external document links (PDFs, etc)
                            is_same_domain = parsed_next.netloc == domain
                            is_document = any(parsed_next.path.lower().endswith(ext) for ext in [".pdf", ".docx", ".pptx", ".xlsx"])
                            
                            if (is_same_domain or is_document) and parsed_next.scheme in ["http", "https"]:
                                # Clean URL (remove fragments)
                                clean_url = f"{parsed_next.scheme}://{parsed_next.netloc}{parsed_next.path}"
                                if clean_url not in visited:
                                    _crawl(clean_url, current_depth + 1)
                else:
                    print(f"[WebCrawler] Unsupported Content-Type {content_type} for {url}")

            except Exception as e:
                print(f"[WebCrawler] Error crawling {url}: {e}")

        _crawl(base_url, 1)
        return accumulated_text

web_crawler_service = WebCrawlerService()
