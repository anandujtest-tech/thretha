#!/usr/bin/env python3
"""
THRETHA COUTURE - Regression Test for MEDIA_DIR Refactor
Tests core functionality after changing MEDIA_DIR from hardcoded to env-driven
"""

import requests
import json
import io
from PIL import Image

# Base URL from environment
BASE_URL = "https://kerala-drop.preview.emergentagent.com/api"

# Admin credentials
ADMIN_EMAIL = "admin@threthacouture.com"
ADMIN_PASSWORD = "thretha@2026"

# Global variables
admin_token = None
test_product_id = None

def print_test(name):
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_success(msg):
    print(f"✅ SUCCESS: {msg}")

def print_error(msg):
    print(f"❌ ERROR: {msg}")

def print_info(msg):
    print(f"ℹ️  INFO: {msg}")

# ============================================================================
# TEST 1: Seed Media File (proves env-driven MEDIA_DIR works)
# ============================================================================
def test_seed_media():
    print_test("GET /api/media/file/seed-01.jpg")
    try:
        response = requests.get(f"{BASE_URL}/media/file/seed-01.jpg", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            content_type = response.headers.get('Content-Type', '')
            print_info(f"Content-Type: {content_type}")
            
            if content_type == 'image/jpeg':
                print_success("Seed image served correctly with Content-Type: image/jpeg")
                return True
            else:
                print_error(f"Expected Content-Type 'image/jpeg', got '{content_type}'")
                return False
        else:
            print_error(f"Expected 200, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

# ============================================================================
# TEST 2: Media Upload with Auth
# ============================================================================
def test_media_upload():
    print_test("POST /api/admin/media - Upload with/without token")
    global admin_token
    
    tests_passed = 0
    tests_total = 0
    
    # First, get admin token
    try:
        print_info("\n--- Getting admin token ---")
        login_data = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        response = requests.post(f"{BASE_URL}/admin/login", json=login_data, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get('token')
            print_info(f"Token obtained: {admin_token[:50]}...")
        else:
            print_error(f"Failed to get admin token: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception getting token: {str(e)}")
        return False
    
    # Test 2.1: Upload without token (should 401)
    try:
        tests_total += 1
        print_info("\n--- Test 2.1: POST without token (should 401) ---")
        
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        files = {'file': ('test.jpg', img_bytes, 'image/jpeg')}
        response = requests.post(f"{BASE_URL}/admin/media", files=files, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 401:
            print_success("Upload without token returns 401 as expected")
            tests_passed += 1
        else:
            print_error(f"Expected 401, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 2.2: Upload with token (should 200)
    try:
        tests_total += 1
        print_info("\n--- Test 2.2: POST with Bearer token (should 200) ---")
        
        img = Image.new('RGB', (100, 100), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        files = {'file': ('regression_test.png', img_bytes, 'image/png')}
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/admin/media", files=files, headers=headers, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response: {data}")
            
            if 'url' in data and 'type' in data:
                media_url = data['url']
                media_type = data['type']
                
                if media_type == 'image':
                    print_success(f"Media uploaded - URL: {media_url}, type: {media_type}")
                    tests_passed += 1
                    
                    # Test 2.3: GET the uploaded media
                    try:
                        tests_total += 1
                        print_info("\n--- Test 2.3: GET uploaded media file ---")
                        
                        full_url = f"https://kerala-drop.preview.emergentagent.com{media_url}"
                        print_info(f"Fetching: {full_url}")
                        
                        get_response = requests.get(full_url, timeout=10)
                        print_info(f"Status: {get_response.status_code}")
                        
                        if get_response.status_code == 200:
                            content_type = get_response.headers.get('Content-Type', '')
                            print_info(f"Content-Type: {content_type}")
                            
                            if content_type.startswith('image/'):
                                print_success(f"Uploaded media served correctly with Content-Type: {content_type}")
                                tests_passed += 1
                            else:
                                print_error(f"Expected image content-type, got {content_type}")
                        else:
                            print_error(f"Expected 200, got {get_response.status_code}")
                            if get_response.text:
                                print_info(f"Response: {get_response.text}")
                    except Exception as e:
                        print_error(f"Exception: {str(e)}")
                else:
                    print_error(f"Expected type 'image', got '{media_type}'")
            else:
                print_error("Missing 'url' or 'type' in response")
        else:
            print_error(f"Expected 200, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Media Upload Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 3: Core Public Endpoints
# ============================================================================
def test_core_endpoints():
    print_test("Core Public Endpoints - products, settings, categories")
    global test_product_id
    
    tests_passed = 0
    tests_total = 0
    
    # Test 3.1: GET /api/products
    try:
        tests_total += 1
        print_info("\n--- Test 3.1: GET /api/products ---")
        
        response = requests.get(f"{BASE_URL}/products", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Products count: {len(data)}")
            
            if len(data) > 0:
                test_product_id = data[0].get('id')
                print_info(f"Stored product ID: {test_product_id}")
                print_success(f"Products endpoint working - {len(data)} products returned")
                tests_passed += 1
            else:
                print_error("No products returned")
        else:
            print_error(f"Expected 200, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 3.2: GET /api/settings
    try:
        tests_total += 1
        print_info("\n--- Test 3.2: GET /api/settings ---")
        
        response = requests.get(f"{BASE_URL}/settings", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Settings keys: {list(data.keys())}")
            
            # Check for whatsapp and hero.images
            has_whatsapp = 'whatsapp' in data
            has_hero_images = 'hero' in data and isinstance(data.get('hero', {}).get('images'), list)
            
            if has_whatsapp and has_hero_images:
                print_info(f"WhatsApp: {data.get('whatsapp')}")
                print_info(f"Hero images count: {len(data.get('hero', {}).get('images', []))}")
                print_success("Settings endpoint working with whatsapp and hero.images")
                tests_passed += 1
            else:
                print_error(f"Missing whatsapp or hero.images - has_whatsapp: {has_whatsapp}, has_hero_images: {has_hero_images}")
        else:
            print_error(f"Expected 200, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 3.3: GET /api/categories
    try:
        tests_total += 1
        print_info("\n--- Test 3.3: GET /api/categories ---")
        
        response = requests.get(f"{BASE_URL}/categories", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Categories count: {len(data)}")
            
            if len(data) == 2:
                names = [cat.get('name') for cat in data]
                print_info(f"Category names: {names}")
                print_success(f"Categories endpoint working - 2 categories returned")
                tests_passed += 1
            else:
                print_error(f"Expected 2 categories, got {len(data)}")
        else:
            print_error(f"Expected 200, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Core Endpoints Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 4: Admin Login and Stats
# ============================================================================
def test_admin_flow():
    print_test("Admin Login and Stats")
    global admin_token
    
    tests_passed = 0
    tests_total = 0
    
    # Test 4.1: POST /api/admin/login
    try:
        tests_total += 1
        print_info("\n--- Test 4.1: POST /api/admin/login ---")
        
        login_data = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        response = requests.post(f"{BASE_URL}/admin/login", json=login_data, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'token' in data:
                admin_token = data['token']
                print_info(f"Token: {admin_token[:50]}...")
                print_success("Admin login successful - token returned")
                tests_passed += 1
            else:
                print_error("Missing 'token' in response")
        else:
            print_error(f"Expected 200, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.2: GET /api/admin/stats with token
    if admin_token:
        try:
            tests_total += 1
            print_info("\n--- Test 4.2: GET /api/admin/stats with Bearer token ---")
            
            headers = {"Authorization": f"Bearer {admin_token}"}
            response = requests.get(f"{BASE_URL}/admin/stats", headers=headers, timeout=10)
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print_info(f"Stats: {data}")
                print_success("Admin stats endpoint working with auth")
                tests_passed += 1
            else:
                print_error(f"Expected 200, got {response.status_code}")
                if response.text:
                    print_info(f"Response: {response.text}")
        except Exception as e:
            print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Admin Flow Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 5: Order Creation with WhatsApp
# ============================================================================
def test_order_creation():
    print_test("POST /api/orders - Order creation with WhatsApp")
    global test_product_id
    
    if not test_product_id:
        print_error("No product ID available - skipping order test")
        return False
    
    try:
        print_info(f"\n--- Creating order with product ID: {test_product_id} ---")
        
        order_data = {
            "customer": {
                "name": "Lakshmi Nair",
                "whatsapp": "919876543210",
                "phone": "919876543210",
                "house": "Sreelakshmi",
                "street": "Temple Road",
                "city": "Thrissur",
                "district": "Thrissur",
                "state": "Kerala",
                "pincode": "680001"
            },
            "item": {
                "product_id": test_product_id,
                "size": "Free Size",
                "quantity": 1
            }
        }
        
        response = requests.post(f"{BASE_URL}/orders", json=order_data, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            
            if 'whatsapp' in data:
                wa_url = data['whatsapp'].get('url', '')
                print_info(f"WhatsApp URL: {wa_url[:100]}...")
                
                if wa_url.startswith('https://wa.me/'):
                    print_success(f"Order created successfully - WhatsApp URL starts with https://wa.me/")
                    return True
                else:
                    print_error(f"WhatsApp URL doesn't start with https://wa.me/ - got: {wa_url[:100]}")
                    return False
            else:
                print_error("Missing 'whatsapp' in response")
                return False
        else:
            print_error(f"Expected 200, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================
def main():
    print("\n" + "="*80)
    print("THRETHA COUTURE - REGRESSION TEST (MEDIA_DIR Refactor)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing: MEDIA_DIR change from hardcoded to env-driven")
    print("="*80 + "\n")
    
    results = {}
    
    # Run regression tests in order
    results['1. Seed Media File'] = test_seed_media()
    results['2. Media Upload with Auth'] = test_media_upload()
    results['3. Core Public Endpoints'] = test_core_endpoints()
    results['4. Admin Login and Stats'] = test_admin_flow()
    results['5. Order Creation with WhatsApp'] = test_order_creation()
    
    # Print final summary
    print("\n" + "="*80)
    print("REGRESSION TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print("="*80)
    print(f"Total: {passed + failed} test suites")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    
    if failed == 0:
        print("\n🎉 ALL REGRESSION TESTS PASSED - MEDIA_DIR refactor successful!")
    else:
        print(f"\n⚠️  {failed} test suite(s) failed - review output above for details")
    
    print("="*80 + "\n")
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
