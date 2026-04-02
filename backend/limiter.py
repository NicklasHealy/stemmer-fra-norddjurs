"""Delt slowapi Limiter-instans.

Importeres af main.py (app.state.limiter) og alle routers der bruger
@limiter.limit(). Separat modul for at undgå cirkulære imports.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
