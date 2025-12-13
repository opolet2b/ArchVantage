"""
Agent Secret Manager

Encrypted secret storage and injection for agent blueprints.
Uses Fernet symmetric encryption (AES-128-CBC with HMAC).
"""
import os
import re
from typing import Dict, Optional
from cryptography.fernet import Fernet
from base64 import urlsafe_b64encode, urlsafe_b64decode


class AgentSecretManager:
    """
    Manages encrypted secrets for agent blueprints.
    
    Secrets are encrypted at rest and injected at runtime using
    the {{secrets.KEY_NAME}} syntax.
    """
    
    def __init__(self, encryption_key: Optional[str] = None):
        """
        Initialize the secret manager.
        
        Args:
            encryption_key: Base64-encoded Fernet key. If not provided,
                           uses SECRET_ENCRYPTION_KEY from environment.
        """
        if encryption_key:
            self.key = encryption_key.encode()
        else:
            env_key = os.getenv("SECRET_ENCRYPTION_KEY")
            if env_key:
                self.key = env_key.encode()
            else:
                # Generate a new key for development
                # In production, this should be set via environment variable
                self.key = Fernet.generate_key()
        
        self.fernet = Fernet(self.key)
    
    def encrypt_secret(self, value: str) -> str:
        """
        Encrypt a secret value.
        
        Args:
            value: Plain text secret value
            
        Returns:
            Base64-encoded encrypted value
        """
        encrypted = self.fernet.encrypt(value.encode())
        return encrypted.decode()
    
    def decrypt_secret(self, encrypted_value: str) -> str:
        """
        Decrypt a secret value.
        
        Args:
            encrypted_value: Base64-encoded encrypted value
            
        Returns:
            Decrypted plain text value
        """
        decrypted = self.fernet.decrypt(encrypted_value.encode())
        return decrypted.decode()
    
    def inject_secrets(
        self, 
        template: str, 
        secrets: Dict[str, str]
    ) -> str:
        """
        Replace {{secrets.KEY_NAME}} placeholders with actual values.
        
        Args:
            template: String containing secret placeholders
            secrets: Dictionary of decrypted secret values
            
        Returns:
            String with secrets injected
        """
        pattern = r'\{\{secrets\.([A-Za-z_][A-Za-z0-9_]*)\}\}'
        
        def replace_secret(match):
            key_name = match.group(1)
            if key_name in secrets:
                return secrets[key_name]
            return match.group(0)  # Keep original if not found
        
        return re.sub(pattern, replace_secret, template)
    
    def load_blueprint_secrets(
        self, 
        db, 
        blueprint_id: str
    ) -> Dict[str, str]:
        """
        Load and decrypt all secrets for a blueprint.
        
        Args:
            db: Database session
            blueprint_id: ID of the blueprint
            
        Returns:
            Dictionary of decrypted secrets {key_name: value}
        """
        from app.models.agent_blueprint import AgentSecret
        
        secrets = db.query(AgentSecret).filter(
            AgentSecret.blueprint_id == blueprint_id
        ).all()
        
        return {
            secret.key_name: self.decrypt_secret(secret.encrypted_value)
            for secret in secrets
        }
    
    def save_secret(
        self, 
        db, 
        blueprint_id: str, 
        key_name: str, 
        value: str
    ):
        """
        Save or update an encrypted secret.
        
        Args:
            db: Database session
            blueprint_id: ID of the blueprint
            key_name: Name of the secret key
            value: Plain text value to encrypt
        """
        from app.models.agent_blueprint import AgentSecret
        
        encrypted = self.encrypt_secret(value)
        
        # Check if secret exists
        existing = db.query(AgentSecret).filter(
            AgentSecret.blueprint_id == blueprint_id,
            AgentSecret.key_name == key_name
        ).first()
        
        if existing:
            existing.encrypted_value = encrypted
        else:
            new_secret = AgentSecret(
                blueprint_id=blueprint_id,
                key_name=key_name,
                encrypted_value=encrypted
            )
            db.add(new_secret)
        
        db.commit()
    
    def delete_secret(self, db, blueprint_id: str, key_name: str):
        """Delete a secret."""
        from app.models.agent_blueprint import AgentSecret
        
        db.query(AgentSecret).filter(
            AgentSecret.blueprint_id == blueprint_id,
            AgentSecret.key_name == key_name
        ).delete()
        
        db.commit()


# Global instance
secret_manager = AgentSecretManager()
