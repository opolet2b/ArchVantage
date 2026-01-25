import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import pytest
from app.services.scraper_service import ScraperService
from unittest.mock import MagicMock, patch

def test_is_internal_link():
    scraper = ScraperService()
    assert scraper.is_internal_link("https://example.com", "https://example.com/page") is True
    assert scraper.is_internal_link("https://example.com", "/page") is True
    assert scraper.is_internal_link("https://example.com", "https://other.com") is False

@patch('requests.Session.get')
def test_scrape_recursive(mock_get):
    scraper = ScraperService()
    
    # Mock responses
    mock_response_1 = MagicMock()
    mock_response_1.headers = {"Content-Type": "text/html"}
    mock_response_1.text = "<html><title>Home</title><body><a href='/about'>About</a></body></html>"
    mock_response_1.status_code = 200
    
    mock_response_2 = MagicMock()
    mock_response_2.headers = {"Content-Type": "text/html"}
    mock_response_2.text = "<html><title>About</title><body>Info</body></html>"
    mock_response_2.status_code = 200
    
    mock_get.side_effect = [mock_response_1, mock_response_2]
    
    pages = scraper.scrape_recursive("https://example.com", max_depth=1)
    
    assert len(pages) == 2
    assert "https://example.com" in pages
    assert "https://example.com/about" in pages
    assert "# Home" in pages["https://example.com"]
    assert "# About" in pages["https://example.com/about"]

def test_html_to_markdown():
    from bs4 import BeautifulSoup
    scraper = ScraperService()
    html = "<html><body><h1>Title</h1><p>Some text</p><ul><li>Item 1</li></ul></body></html>"
    soup = BeautifulSoup(html, "html.parser")
    markdown = scraper.html_to_markdown(soup, "https://example.com")
    
    assert "# Title" in markdown
    assert "Some text" in markdown
    assert "- Item 1" in markdown
