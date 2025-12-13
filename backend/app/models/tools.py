from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Enum, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base

class PermissionLevel(str, enum.Enum):
    READ = "READ"
    READ_WRITE = "READ_WRITE"

class AuthType(str, enum.Enum):
    NONE = "NONE"
    OAUTH2 = "OAUTH2"
    API_KEY = "API_KEY"


class ToolType(str, enum.Enum):
    """
    Differentiates between tool types.
    
    - MCP: Backend tools that connect to MCP servers
    - GUI: Frontend form-based tools for user input collection
    """
    MCP = "mcp"
    GUI = "gui"

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    
    tools = relationship("Tool", back_populates="category")

class Tool(Base):
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    # Using String instead of Enum for flexibility with existing data
    # Valid values: 'mcp', 'gui' - validated at Pydantic schema level
    tool_type = Column(String(10), default='mcp')
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    configuration = Column(JSON, default={})  # MCP config or GUI schema
    system_prompt = Column(Text, nullable=True)  # Generated system prompt
    owner_id = Column(Integer, ForeignKey("users.id"))
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    category = relationship("Category", back_populates="tools")
    owner = relationship("app.models.user.User")
    permissions = relationship("ToolPermission", back_populates="tool", cascade="all, delete-orphan")

class ToolPermission(Base):
    __tablename__ = "tool_permissions"

    id = Column(Integer, primary_key=True, index=True)
    tool_id = Column(Integer, ForeignKey("tools.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ad_group_id = Column(Integer, ForeignKey("known_ad_groups.id"), nullable=True)
    permission_level = Column(Enum(PermissionLevel), default=PermissionLevel.READ)

    tool = relationship("Tool", back_populates="permissions")
    user = relationship("app.models.user.User")
    ad_group = relationship("app.models.user.KnownADGroup")

class MCPServer(Base):
    __tablename__ = "mcp_servers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    base_url = Column(String)
    description = Column(String, nullable=True)
    auth_type = Column(Enum(AuthType), default=AuthType.NONE)
    auth_config = Column(JSON, default={})  # Stores auth credentials
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    permissions = relationship("MCPServerPermission", back_populates="mcp_server", cascade="all, delete-orphan")

class MCPServerPermission(Base):
    __tablename__ = "mcp_server_permissions"

    id = Column(Integer, primary_key=True, index=True)
    mcp_server_id = Column(Integer, ForeignKey("mcp_servers.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ad_group_id = Column(Integer, ForeignKey("known_ad_groups.id"), nullable=True)

    mcp_server = relationship("MCPServer", back_populates="permissions")
    user = relationship("app.models.user.User")
    ad_group = relationship("app.models.user.KnownADGroup")
