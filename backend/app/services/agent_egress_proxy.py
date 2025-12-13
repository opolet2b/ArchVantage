"""
Agent Egress Proxy

SSRF protection for HTTP requests made by agent primitives.
Validates URLs to prevent access to internal networks and metadata services.
"""
from typing import Set
import ipaddress
import socket
from urllib.parse import urlparse


# Blocked IP ranges (private networks, localhost, cloud metadata)
BLOCKED_IP_RANGES: Set[ipaddress.IPv4Network] = {
    ipaddress.ip_network("127.0.0.0/8"),       # Localhost
    ipaddress.ip_network("10.0.0.0/8"),        # Private Class A
    ipaddress.ip_network("172.16.0.0/12"),     # Private Class B
    ipaddress.ip_network("192.168.0.0/16"),    # Private Class C
    ipaddress.ip_network("169.254.0.0/16"),    # Link-local / Cloud metadata
    ipaddress.ip_network("0.0.0.0/8"),         # "This" network
}

# Blocked hostnames
BLOCKED_HOSTNAMES: Set[str] = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "metadata.google.internal",
    "metadata",
}


class EgressProxy:
    """
    Security proxy for outbound HTTP requests.
    
    Validates URLs to prevent Server-Side Request Forgery (SSRF) attacks.
    """
    
    def __init__(self):
        self.blocked_ranges = BLOCKED_IP_RANGES
        self.blocked_hostnames = BLOCKED_HOSTNAMES
    
    def validate_url(self, url: str) -> bool:
        """
        Validate if a URL is safe to access.
        
        Args:
            url: The URL to validate
            
        Returns:
            True if safe, False if blocked
        """
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname
            
            if not hostname:
                return False
            
            # Check blocked hostnames
            if hostname.lower() in self.blocked_hostnames:
                return False
            
            # Resolve hostname to IP
            try:
                ip = socket.gethostbyname(hostname)
                ip_addr = ipaddress.ip_address(ip)
                
                # Check against blocked ranges
                for blocked_range in self.blocked_ranges:
                    if ip_addr in blocked_range:
                        return False
                        
            except socket.gaierror:
                # Can't resolve hostname - block for safety
                return False
            
            return True
            
        except Exception:
            return False
    
    def is_internal_network(self, ip: str) -> bool:
        """Check if an IP belongs to an internal network."""
        try:
            ip_addr = ipaddress.ip_address(ip)
            for blocked_range in self.blocked_ranges:
                if ip_addr in blocked_range:
                    return True
            return False
        except ValueError:
            return True  # Invalid IP format treated as internal


# Global instance
egress_proxy = EgressProxy()
