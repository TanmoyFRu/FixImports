#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Example script demonstrating misplaced vs deliberate imports."""
from __future__ import annotations
import os

# 1. Deliberate fallback import (SHOULD NOT BE MOVED)
try:
    import ujson as json
except (ImportError, ModuleNotFoundError):
    import json

# 2. Typing guard import (SHOULD NOT BE MOVED)
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from decimal import Decimal

def process_data():
    # 3. Misplaced stdlib import (SHOULD BE MOVED TO TOP)
    import math
    return math.sqrt(25)

def fetch_records():
    # 4. Misplaced try-nested import with generic Exception (SHOULD BE MOVED TO TOP)
    # Notice: Removing this import will safely insert 'pass' so this block never causes IndentationError!
    try:
        import requests
    except Exception:
        pass
