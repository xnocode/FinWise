#!/usr/bin/env python3
"""Batch update all API route files to use getUserEmail() instead of hardcoded demo@example.com"""
import os
import re

API_DIR = '/home/z/my-project/src/app/api'
FILES_TO_UPDATE = [
    'analytics', 'bills', 'budget', 'chat', 'currency', 'debt',
    'export', 'goals', 'innovation', 'insights', 'recommendations',
    'settings', 'simulation', 'smart-insights', 'transactions',
]

for endpoint in FILES_TO_UPDATE:
    filepath = os.path.join(API_DIR, endpoint, 'route.ts')
    if not os.path.exists(filepath):
        print(f"SKIP: {filepath} not found")
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Check if file already imports getUserEmail
    if 'getUserEmail' in content:
        print(f"SKIP: {endpoint} already updated")
        continue
    
    # Add import for getUserEmail after the last import line
    import_line = "import { getUserEmail } from '@/lib/auth'\n"
    
    # Find the last import statement and add after it
    lines = content.split('\n')
    last_import_idx = 0
    for i, line in enumerate(lines):
        if line.startswith('import '):
            last_import_idx = i
    
    lines.insert(last_import_idx + 1, import_line.rstrip())
    content = '\n'.join(lines)
    
    # Replace hardcoded email patterns
    # Pattern 1: where: { email: 'demo@example.com' }
    content = re.sub(
        r"where:\s*\{\s*email:\s*'demo@example\.com'\s*\}",
        "where: { email: getUserEmail(req) }",
        content
    )
    
    # Pattern 2: const userEmail = 'demo@example.com'
    content = re.sub(
        r"(?:const|let)\s+\w*\s*=\s*'demo@example\.com'",
        "const userEmail = getUserEmail(req)",
        content
    )
    
    # Pattern 3: 'demo@example.com' used directly as argument
    content = content.replace("'demo@example.com'", "getUserEmail(req)")
    
    # Now we need to make sure 'req' is available in functions that use it
    # Check if any GET functions need to accept req parameter
    # Pattern: export async function GET() {
    content = re.sub(
        r'export async function GET\(\)',
        'export async function GET(req: NextRequest)',
        content
    )
    
    # Make sure NextRequest is imported
    if 'NextRequest' not in content and 'NextRequest' in content.replace('NextRequest', ''):
        # Add NextRequest to the next/server import
        content = re.sub(
            r"import \{ NextResponse \} from 'next/server'",
            "import { NextRequest, NextResponse } from 'next/server'",
            content
        )
    
    # Also check for PATCH functions
    content = re.sub(
        r'export async function PATCH\(\)',
        'export async function PATCH(req: NextRequest)',
        content
    )
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"UPDATED: {endpoint}")
    else:
        print(f"NO CHANGE: {endpoint}")

print("\nDone!")
