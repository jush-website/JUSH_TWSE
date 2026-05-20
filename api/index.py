import sys
import os

# Add the project root to sys.path so we can import from 'src'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.web_app import app

# Vercel treats this 'app' as the ASGI entry point
