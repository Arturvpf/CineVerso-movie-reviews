"""Contratos de cadastro, login e identificação da conta."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Password = Annotated[str, StringConstraints(min_length=12, max_length=128)]


class RegisterInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    display_name: DisplayName
    password: Password


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName


class UserRead(BaseModel):
    id: str
    email: EmailStr
    display_name: str
    role: Literal["admin", "user"]
    created_at: datetime
    avatar_url: str | None
