#!/usr/bin/env python3
"""
THRETHA COUTURE Backend API Test Suite
Tests all backend endpoints for the fashion e-commerce platform
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

# Global variables for test data
admin_token = None
test_product_id = None
test_category_id = None
test_order_id = None
test_media_url = None

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
# TEST 1: Health Check
# ============================================================================
def test_health():
    print_test("GET /api/health")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get('ok') == True:
                print_success("Health check passed - returns {ok: true}")
                return True
            else:
                print_error(f"Expected {{ok: true}}, got {data}")
                return False
        else:
            print_error(f"Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

# ============================================================================
# TEST 2: Public Settings
# ============================================================================
def test_public_settings():
    print_test("GET /api/settings")
    try:
        response = requests.get(f"{BASE_URL}/settings", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            
            # Check required fields
            required_fields = ['brand_name', 'whatsapp', 'hero', 'shipping']
            missing = [f for f in required_fields if f not in data]
            
            if missing:
                print_error(f"Missing required fields: {missing}")
                return False
            
            # Verify whatsapp number
            if data.get('whatsapp') != '918301824696':
                print_error(f"Expected whatsapp '918301824696', got '{data.get('whatsapp')}'")
                return False
            
            # Verify hero has images array
            if not isinstance(data.get('hero', {}).get('images'), list):
                print_error("hero.images is not an array")
                return False
            
            # Verify shipping is an object
            if not isinstance(data.get('shipping'), dict):
                print_error("shipping is not an object")
                return False
            
            # Verify password_hash and _id are NOT present
            if 'password_hash' in data:
                print_error("password_hash should not be in response")
                return False
            
            if '_id' in data:
                print_error("_id should not be in response")
                return False
            
            print_success(f"Settings endpoint working - brand: {data.get('brand_name')}, whatsapp: {data.get('whatsapp')}")
            return True
        else:
            print_error(f"Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

# ============================================================================
# TEST 3: Categories List
# ============================================================================
def test_categories():
    print_test("GET /api/categories")
    global test_category_id
    try:
        response = requests.get(f"{BASE_URL}/categories", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Categories count: {len(data)}")
            
            if len(data) != 2:
                print_error(f"Expected 2 categories, got {len(data)}")
                return False
            
            # Check for Sarees and Crop-tops
            names = [cat.get('name') for cat in data]
            print_info(f"Category names: {names}")
            
            if 'Sarees' not in names or 'Crop Tops' not in names:
                print_error(f"Expected 'Sarees' and 'Crop Tops', got {names}")
                return False
            
            # Verify each has product_count
            for cat in data:
                if 'product_count' not in cat:
                    print_error(f"Category {cat.get('name')} missing product_count")
                    return False
                print_info(f"{cat.get('name')}: {cat.get('product_count')} products")
            
            # Store a category ID for later tests
            test_category_id = data[0].get('id')
            
            print_success(f"Categories endpoint working - 2 active categories with product counts")
            return True
        else:
            print_error(f"Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

# ============================================================================
# TEST 4: Products Listing with Filters
# ============================================================================
def test_products_listing():
    print_test("GET /api/products - Basic listing and filters")
    global test_product_id
    
    tests_passed = 0
    tests_total = 0
    
    # Test 4.1: Basic listing
    try:
        tests_total += 1
        print_info("\n--- Test 4.1: Basic product listing ---")
        response = requests.get(f"{BASE_URL}/products", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Products count: {len(data)}")
            
            if len(data) == 10:
                print_success("Basic listing returns 10 products")
                tests_passed += 1
                # Store a product ID for later tests
                if data:
                    test_product_id = data[0].get('id')
                    print_info(f"Stored test product ID: {test_product_id}")
            else:
                print_error(f"Expected 10 products, got {len(data)}")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.2: Filter by category
    try:
        tests_total += 1
        print_info("\n--- Test 4.2: Filter by category=sarees ---")
        response = requests.get(f"{BASE_URL}/products?category=sarees", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Sarees count: {len(data)}")
            
            # Verify all are sarees
            all_sarees = all(p.get('category_name') == 'Sarees' for p in data)
            if all_sarees and len(data) == 6:
                print_success(f"Category filter working - {len(data)} sarees")
                tests_passed += 1
            else:
                print_error(f"Category filter issue - got {len(data)} products, all sarees: {all_sarees}")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.3: Filter by new=true
    try:
        tests_total += 1
        print_info("\n--- Test 4.3: Filter by new=true ---")
        response = requests.get(f"{BASE_URL}/products?new=true", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"New arrivals count: {len(data)}")
            
            all_new = all(p.get('new_arrival') == True for p in data)
            if all_new:
                print_success(f"New filter working - {len(data)} new arrivals")
                tests_passed += 1
            else:
                print_error("Some products are not marked as new_arrival")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.4: Filter by featured=true
    try:
        tests_total += 1
        print_info("\n--- Test 4.4: Filter by featured=true ---")
        response = requests.get(f"{BASE_URL}/products?featured=true", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Featured count: {len(data)}")
            
            all_featured = all(p.get('featured') == True for p in data)
            if all_featured:
                print_success(f"Featured filter working - {len(data)} featured products")
                tests_passed += 1
            else:
                print_error("Some products are not marked as featured")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.5: Search by text
    try:
        tests_total += 1
        print_info("\n--- Test 4.5: Search for 'rose' ---")
        response = requests.get(f"{BASE_URL}/products?search=rose", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Search results count: {len(data)}")
            
            if len(data) > 0:
                print_info(f"Found products: {[p.get('name') for p in data]}")
                print_success(f"Search working - found {len(data)} products")
                tests_passed += 1
            else:
                print_error("Search returned no results for 'rose'")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.6: Filter by colour
    try:
        tests_total += 1
        print_info("\n--- Test 4.6: Filter by colour=rose ---")
        response = requests.get(f"{BASE_URL}/products?colour=rose", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Colour filter count: {len(data)}")
            
            if len(data) > 0:
                print_info(f"Found products: {[p.get('name') for p in data]}")
                print_success(f"Colour filter working - found {len(data)} products")
                tests_passed += 1
            else:
                print_error("Colour filter returned no results")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.7: Sort by price_asc
    try:
        tests_total += 1
        print_info("\n--- Test 4.7: Sort by price_asc ---")
        response = requests.get(f"{BASE_URL}/products?sort=price_asc", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            prices = [p.get('discount_price') or p.get('price') for p in data]
            print_info(f"Prices (ascending): {prices[:5]}...")
            
            is_sorted = all(prices[i] <= prices[i+1] for i in range(len(prices)-1))
            if is_sorted:
                print_success("Price ascending sort working")
                tests_passed += 1
            else:
                print_error("Prices not sorted in ascending order")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.8: Sort by price_desc
    try:
        tests_total += 1
        print_info("\n--- Test 4.8: Sort by price_desc ---")
        response = requests.get(f"{BASE_URL}/products?sort=price_desc", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            prices = [p.get('discount_price') or p.get('price') for p in data]
            print_info(f"Prices (descending): {prices[:5]}...")
            
            is_sorted = all(prices[i] >= prices[i+1] for i in range(len(prices)-1))
            if is_sorted:
                print_success("Price descending sort working")
                tests_passed += 1
            else:
                print_error("Prices not sorted in descending order")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.9: Filter by availability=in
    try:
        tests_total += 1
        print_info("\n--- Test 4.9: Filter by availability=in ---")
        response = requests.get(f"{BASE_URL}/products?availability=in", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"In-stock products count: {len(data)}")
            
            all_in_stock = all(p.get('stock', 0) > 0 for p in data)
            if all_in_stock:
                print_success(f"Availability filter working - {len(data)} in-stock products")
                tests_passed += 1
            else:
                print_error("Some products have stock=0")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.10: Filter by size
    try:
        tests_total += 1
        print_info("\n--- Test 4.10: Filter by size=M ---")
        response = requests.get(f"{BASE_URL}/products?size=M", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Size M products count: {len(data)}")
            
            # Verify all have size M available
            has_size_m = all(
                any(s.get('size') == 'M' and s.get('available') for s in p.get('sizes', []))
                for p in data
            )
            if has_size_m:
                print_success(f"Size filter working - {len(data)} products with size M")
                tests_passed += 1
            else:
                print_error("Some products don't have size M available")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.11: Filter by minPrice
    try:
        tests_total += 1
        print_info("\n--- Test 4.11: Filter by minPrice=2000 ---")
        response = requests.get(f"{BASE_URL}/products?minPrice=2000", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Products >= 2000: {len(data)}")
            
            all_above_min = all(p.get('price', 0) >= 2000 for p in data)
            if all_above_min:
                print_success(f"minPrice filter working - {len(data)} products")
                tests_passed += 1
            else:
                print_error("Some products below minPrice")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 4.12: Filter by maxPrice
    try:
        tests_total += 1
        print_info("\n--- Test 4.12: Filter by maxPrice=2000 ---")
        response = requests.get(f"{BASE_URL}/products?maxPrice=2000", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Products <= 2000: {len(data)}")
            
            all_below_max = all(p.get('price', 0) <= 2000 for p in data)
            if all_below_max:
                print_success(f"maxPrice filter working - {len(data)} products")
                tests_passed += 1
            else:
                print_error("Some products above maxPrice")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Products Listing Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 5: Product Detail by Slug
# ============================================================================
def test_product_detail():
    print_test("GET /api/products/:slug")
    
    tests_passed = 0
    tests_total = 0
    
    # Test 5.1: Valid slug
    try:
        tests_total += 1
        print_info("\n--- Test 5.1: Get product by valid slug ---")
        response = requests.get(f"{BASE_URL}/products/kerala-rose-saree", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Product: {data.get('name')}")
            
            if data.get('slug') == 'kerala-rose-saree':
                print_success(f"Product detail working - {data.get('name')}")
                tests_passed += 1
            else:
                print_error(f"Expected slug 'kerala-rose-saree', got {data.get('slug')}")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 5.2: Invalid slug (404)
    try:
        tests_total += 1
        print_info("\n--- Test 5.2: Get product by invalid slug (should 404) ---")
        response = requests.get(f"{BASE_URL}/products/nonexistent-product-slug", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 404:
            print_success("Invalid slug returns 404 as expected")
            tests_passed += 1
        else:
            print_error(f"Expected 404, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Product Detail Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 6: Create Order + WhatsApp
# ============================================================================
def test_create_order():
    print_test("POST /api/orders")
    global test_order_id, test_product_id
    
    tests_passed = 0
    tests_total = 0
    
    # First get a product ID if we don't have one
    if not test_product_id:
        try:
            response = requests.get(f"{BASE_URL}/products", timeout=10)
            if response.status_code == 200:
                products = response.json()
                if products:
                    test_product_id = products[0].get('id')
                    print_info(f"Using product ID: {test_product_id}")
        except Exception as e:
            print_error(f"Failed to get product ID: {str(e)}")
            return False
    
    # Test 6.1: Valid order creation
    try:
        tests_total += 1
        print_info("\n--- Test 6.1: Create valid order ---")
        
        order_data = {
            "customer": {
                "name": "Priya Menon",
                "whatsapp": "919876543210",
                "phone": "919876543210",
                "house": "Lakshmi Nivas",
                "street": "MG Road",
                "city": "Kochi",
                "district": "Ernakulam",
                "state": "Kerala",
                "pincode": "682001"
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
            
            # Verify order structure
            if 'order' not in data or 'whatsapp' not in data:
                print_error("Missing 'order' or 'whatsapp' in response")
            else:
                order = data['order']
                whatsapp = data['whatsapp']
                
                # Check order_number format TC-YYYY-000N
                order_number = order.get('order_number', '')
                print_info(f"Order number: {order_number}")
                
                import re
                if re.match(r'^TC-\d{4}-\d{4}$', order_number):
                    print_success(f"Order number format correct: {order_number}")
                else:
                    print_error(f"Order number format incorrect: {order_number}")
                
                # Check WhatsApp URL
                wa_url = whatsapp.get('url', '')
                print_info(f"WhatsApp URL: {wa_url[:80]}...")
                
                if wa_url.startswith('https://wa.me/918301824696?text='):
                    print_success("WhatsApp URL format correct")
                else:
                    print_error(f"WhatsApp URL format incorrect: {wa_url[:100]}")
                
                # Check WhatsApp text contains product info
                wa_text = whatsapp.get('text', '')
                if 'Product:' in wa_text and 'Product Code:' in wa_text and 'Size:' in wa_text:
                    print_success("WhatsApp text contains product details")
                    tests_passed += 1
                    test_order_id = order.get('id')
                else:
                    print_error("WhatsApp text missing product details")
        else:
            print_error(f"Expected 200, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 6.2: Missing customer name (400)
    try:
        tests_total += 1
        print_info("\n--- Test 6.2: Order without customer name (should 400) ---")
        
        order_data = {
            "customer": {
                "whatsapp": "919876543210"
            },
            "item": {
                "product_id": test_product_id,
                "size": "Free Size",
                "quantity": 1
            }
        }
        
        response = requests.post(f"{BASE_URL}/orders", json=order_data, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 400:
            print_success("Missing name returns 400 as expected")
            tests_passed += 1
        else:
            print_error(f"Expected 400, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 6.3: Missing product (400/404)
    try:
        tests_total += 1
        print_info("\n--- Test 6.3: Order without product (should 400/404) ---")
        
        order_data = {
            "customer": {
                "name": "Priya Menon",
                "whatsapp": "919876543210"
            },
            "item": {}
        }
        
        response = requests.post(f"{BASE_URL}/orders", json=order_data, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code in [400, 404]:
            print_success(f"Missing product returns {response.status_code} as expected")
            tests_passed += 1
        else:
            print_error(f"Expected 400/404, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Order Creation Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 7: Admin Login
# ============================================================================
def test_admin_login():
    print_test("POST /api/admin/login")
    global admin_token
    
    tests_passed = 0
    tests_total = 0
    
    # Test 7.1: Valid login
    try:
        tests_total += 1
        print_info("\n--- Test 7.1: Login with correct credentials ---")
        
        login_data = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        response = requests.post(f"{BASE_URL}/admin/login", json=login_data, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            
            if 'token' in data and 'user' in data:
                admin_token = data['token']
                print_info(f"Token: {admin_token[:50]}...")
                print_info(f"User: {data['user']}")
                print_success("Admin login successful - token and user returned")
                tests_passed += 1
            else:
                print_error("Missing 'token' or 'user' in response")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 7.2: Wrong password (401)
    try:
        tests_total += 1
        print_info("\n--- Test 7.2: Login with wrong password (should 401) ---")
        
        login_data = {
            "email": ADMIN_EMAIL,
            "password": "wrongpassword123"
        }
        
        response = requests.post(f"{BASE_URL}/admin/login", json=login_data, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 401:
            print_success("Wrong password returns 401 as expected")
            tests_passed += 1
        else:
            print_error(f"Expected 401, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Admin Login Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 8: Auth Protection
# ============================================================================
def test_auth_protection():
    print_test("Auth Protection - GET /api/admin/stats")
    
    tests_passed = 0
    tests_total = 0
    
    # Test 8.1: Without token (401)
    try:
        tests_total += 1
        print_info("\n--- Test 8.1: Access admin stats without token (should 401) ---")
        
        response = requests.get(f"{BASE_URL}/admin/stats", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 401:
            print_success("No token returns 401 as expected")
            tests_passed += 1
        else:
            print_error(f"Expected 401, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 8.2: With valid token (200)
    try:
        tests_total += 1
        print_info("\n--- Test 8.2: Access admin stats with Bearer token (should 200) ---")
        
        if not admin_token:
            print_error("No admin token available - login test may have failed")
        else:
            headers = {"Authorization": f"Bearer {admin_token}"}
            response = requests.get(f"{BASE_URL}/admin/stats", headers=headers, timeout=10)
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print_info(f"Stats keys: {list(data.keys())}")
                
                # Verify expected fields
                expected = ['products', 'categories', 'orders', 'low_stock']
                has_all = all(k in data for k in expected)
                
                if has_all:
                    print_info(f"Products: {data.get('products')}, Categories: {data.get('categories')}, Orders: {data.get('orders')}")
                    print_info(f"Low stock items: {len(data.get('low_stock', []))}")
                    print_success("Admin stats working with auth")
                    tests_passed += 1
                else:
                    print_error(f"Missing expected fields in stats")
            else:
                print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Auth Protection Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 9: Admin Products CRUD
# ============================================================================
def test_admin_products():
    print_test("Admin Products CRUD")
    
    if not admin_token:
        print_error("No admin token - skipping admin products tests")
        return False
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    created_product_id = None
    
    tests_passed = 0
    tests_total = 0
    
    # Test 9.1: Create product
    try:
        tests_total += 1
        print_info("\n--- Test 9.1: POST /api/admin/products (create) ---")
        
        product_data = {
            "name": "Test Elegant Saree",
            "sku": "TC-TEST-001",
            "category_id": test_category_id,
            "description": "A beautiful test saree for automated testing",
            "price": 2999,
            "discount_price": 2499,
            "fabric": "Silk",
            "colour": "Emerald Green",
            "material": "Pure Silk",
            "pattern": "Woven",
            "care_instructions": "Dry clean only",
            "stock": 5,
            "sizes": [{"size": "Free Size", "available": True, "stock": 5}],
            "featured": True,
            "new_arrival": True,
            "active": True
        }
        
        response = requests.post(f"{BASE_URL}/admin/products", json=product_data, headers=headers, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            created_product_id = data.get('id')
            print_info(f"Created product ID: {created_product_id}")
            print_info(f"Product name: {data.get('name')}")
            print_success("Product created successfully")
            tests_passed += 1
        else:
            print_error(f"Expected 200, got {response.status_code}")
            if response.text:
                print_info(f"Response: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 9.2: Update product
    if created_product_id:
        try:
            tests_total += 1
            print_info("\n--- Test 9.2: PUT /api/admin/products/:id (update) ---")
            
            update_data = {
                "price": 3499,
                "stock": 10
            }
            
            response = requests.put(
                f"{BASE_URL}/admin/products/{created_product_id}",
                json=update_data,
                headers=headers,
                timeout=10
            )
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('price') == 3499 and data.get('stock') == 10:
                    print_success(f"Product updated - price: {data.get('price')}, stock: {data.get('stock')}")
                    tests_passed += 1
                else:
                    print_error(f"Update didn't apply correctly")
            else:
                print_error(f"Expected 200, got {response.status_code}")
        except Exception as e:
            print_error(f"Exception: {str(e)}")
    
    # Test 9.3: Duplicate product
    if created_product_id:
        try:
            tests_total += 1
            print_info("\n--- Test 9.3: POST /api/admin/products/:id/duplicate ---")
            
            response = requests.post(
                f"{BASE_URL}/admin/products/{created_product_id}/duplicate",
                headers=headers,
                timeout=10
            )
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                duplicate_id = data.get('id')
                print_info(f"Duplicated product ID: {duplicate_id}")
                print_info(f"Duplicate name: {data.get('name')}")
                
                if duplicate_id != created_product_id and '(Copy)' in data.get('name', ''):
                    print_success("Product duplicated successfully")
                    tests_passed += 1
                    
                    # Clean up duplicate
                    requests.delete(f"{BASE_URL}/admin/products/{duplicate_id}", headers=headers, timeout=10)
                else:
                    print_error("Duplicate doesn't have expected properties")
            else:
                print_error(f"Expected 200, got {response.status_code}")
        except Exception as e:
            print_error(f"Exception: {str(e)}")
    
    # Test 9.4: Delete product
    if created_product_id:
        try:
            tests_total += 1
            print_info("\n--- Test 9.4: DELETE /api/admin/products/:id ---")
            
            response = requests.delete(
                f"{BASE_URL}/admin/products/{created_product_id}",
                headers=headers,
                timeout=10
            )
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('ok') == True:
                    print_success("Product deleted successfully")
                    tests_passed += 1
                else:
                    print_error(f"Unexpected response: {data}")
            else:
                print_error(f"Expected 200, got {response.status_code}")
        except Exception as e:
            print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Admin Products Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 10: Admin Categories CRUD
# ============================================================================
def test_admin_categories():
    print_test("Admin Categories CRUD")
    
    if not admin_token:
        print_error("No admin token - skipping admin categories tests")
        return False
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    created_category_id = None
    
    tests_passed = 0
    tests_total = 0
    
    # Test 10.1: GET categories
    try:
        tests_total += 1
        print_info("\n--- Test 10.1: GET /api/admin/categories ---")
        
        response = requests.get(f"{BASE_URL}/admin/categories", headers=headers, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Categories count: {len(data)}")
            print_success("Admin categories list working")
            tests_passed += 1
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 10.2: Create category
    try:
        tests_total += 1
        print_info("\n--- Test 10.2: POST /api/admin/categories (create) ---")
        
        category_data = {
            "name": "Test Lehengas",
            "description": "Traditional lehengas for special occasions",
            "image": "https://images.unsplash.com/photo-1583391733956-6c78276477e2",
            "active": True
        }
        
        response = requests.post(f"{BASE_URL}/admin/categories", json=category_data, headers=headers, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            created_category_id = data.get('id')
            print_info(f"Created category ID: {created_category_id}")
            print_info(f"Category name: {data.get('name')}")
            print_success("Category created successfully")
            tests_passed += 1
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 10.3: Update category
    if created_category_id:
        try:
            tests_total += 1
            print_info("\n--- Test 10.3: PUT /api/admin/categories/:id (update) ---")
            
            update_data = {
                "description": "Updated description for test category"
            }
            
            response = requests.put(
                f"{BASE_URL}/admin/categories/{created_category_id}",
                json=update_data,
                headers=headers,
                timeout=10
            )
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('description') == update_data['description']:
                    print_success("Category updated successfully")
                    tests_passed += 1
                else:
                    print_error("Update didn't apply correctly")
            else:
                print_error(f"Expected 200, got {response.status_code}")
        except Exception as e:
            print_error(f"Exception: {str(e)}")
    
    # Test 10.4: Delete category
    if created_category_id:
        try:
            tests_total += 1
            print_info("\n--- Test 10.4: DELETE /api/admin/categories/:id ---")
            
            response = requests.delete(
                f"{BASE_URL}/admin/categories/{created_category_id}",
                headers=headers,
                timeout=10
            )
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('ok') == True:
                    print_success("Category deleted successfully")
                    tests_passed += 1
                else:
                    print_error(f"Unexpected response: {data}")
            else:
                print_error(f"Expected 200, got {response.status_code}")
        except Exception as e:
            print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Admin Categories Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 11: Admin Orders
# ============================================================================
def test_admin_orders():
    print_test("Admin Orders - List and Update")
    
    if not admin_token:
        print_error("No admin token - skipping admin orders tests")
        return False
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    tests_passed = 0
    tests_total = 0
    
    # Test 11.1: GET orders
    try:
        tests_total += 1
        print_info("\n--- Test 11.1: GET /api/admin/orders ---")
        
        response = requests.get(f"{BASE_URL}/admin/orders", headers=headers, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Orders count: {len(data)}")
            
            if len(data) > 0:
                # Store an order ID for update test
                global test_order_id
                test_order_id = data[0].get('id')
                print_info(f"Using order ID for update: {test_order_id}")
            
            print_success("Admin orders list working")
            tests_passed += 1
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 11.2: Update order status
    if test_order_id:
        try:
            tests_total += 1
            print_info("\n--- Test 11.2: PUT /api/admin/orders/:id (update status) ---")
            
            update_data = {
                "status": "CONFIRMED"
            }
            
            response = requests.put(
                f"{BASE_URL}/admin/orders/{test_order_id}",
                json=update_data,
                headers=headers,
                timeout=10
            )
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'CONFIRMED':
                    print_success(f"Order status updated to CONFIRMED")
                    tests_passed += 1
                else:
                    print_error(f"Status not updated correctly: {data.get('status')}")
            else:
                print_error(f"Expected 200, got {response.status_code}")
        except Exception as e:
            print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Admin Orders Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 12: Admin Settings
# ============================================================================
def test_admin_settings():
    print_test("Admin Settings - Get and Update")
    
    if not admin_token:
        print_error("No admin token - skipping admin settings tests")
        return False
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    tests_passed = 0
    tests_total = 0
    
    # Test 12.1: GET settings
    try:
        tests_total += 1
        print_info("\n--- Test 12.1: GET /api/admin/settings ---")
        
        response = requests.get(f"{BASE_URL}/admin/settings", headers=headers, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Settings keys: {list(data.keys())[:10]}...")
            original_phone = data.get('phone')
            print_info(f"Current phone: {original_phone}")
            print_success("Admin settings GET working")
            tests_passed += 1
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 12.2: Update settings
    try:
        tests_total += 1
        print_info("\n--- Test 12.2: PUT /api/admin/settings (update phone) ---")
        
        update_data = {
            "phone": "919999888877"
        }
        
        response = requests.put(f"{BASE_URL}/admin/settings", json=update_data, headers=headers, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('phone') == "919999888877":
                print_success(f"Settings updated - phone: {data.get('phone')}")
                
                # Restore original phone
                restore_data = {"phone": "918301824696"}
                requests.put(f"{BASE_URL}/admin/settings", json=restore_data, headers=headers, timeout=10)
                print_info("Restored original phone number")
                
                tests_passed += 1
            else:
                print_error(f"Phone not updated correctly: {data.get('phone')}")
        else:
            print_error(f"Expected 200, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Admin Settings Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# TEST 13: Media Upload and Serve
# ============================================================================
def test_media():
    print_test("Media Upload and Serve")
    
    if not admin_token:
        print_error("No admin token - skipping media tests")
        return False
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    global test_media_url
    
    tests_passed = 0
    tests_total = 0
    
    # Test 13.1: Upload without token (401)
    try:
        tests_total += 1
        print_info("\n--- Test 13.1: POST /api/admin/media without token (should 401) ---")
        
        # Create a small test image
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        files = {'file': ('test.jpg', img_bytes, 'image/jpeg')}
        response = requests.post(f"{BASE_URL}/admin/media", files=files, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 401:
            print_success("Media upload without token returns 401 as expected")
            tests_passed += 1
        else:
            print_error(f"Expected 401, got {response.status_code}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
    
    # Test 13.2: Upload with token (200)
    try:
        tests_total += 1
        print_info("\n--- Test 13.2: POST /api/admin/media with Bearer token ---")
        
        # Create a small test image
        img = Image.new('RGB', (100, 100), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        files = {'file': ('test_upload.jpg', img_bytes, 'image/jpeg')}
        response = requests.post(f"{BASE_URL}/admin/media", files=files, headers=headers, timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response: {data}")
            
            if 'url' in data and 'type' in data:
                test_media_url = data['url']
                media_type = data['type']
                
                if media_type == 'image':
                    print_success(f"Media uploaded - URL: {test_media_url}, type: {media_type}")
                    tests_passed += 1
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
    
    # Test 13.3: Serve uploaded media
    if test_media_url:
        try:
            tests_total += 1
            print_info("\n--- Test 13.3: GET uploaded media file ---")
            
            # Construct full URL
            full_url = f"https://kerala-drop.preview.emergentagent.com{test_media_url}"
            print_info(f"Fetching: {full_url}")
            
            response = requests.get(full_url, timeout=10)
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                content_type = response.headers.get('Content-Type', '')
                print_info(f"Content-Type: {content_type}")
                
                if content_type.startswith('image/'):
                    print_success(f"Media served correctly with Content-Type: {content_type}")
                    tests_passed += 1
                else:
                    print_error(f"Expected image content-type, got {content_type}")
            else:
                print_error(f"Expected 200, got {response.status_code}")
        except Exception as e:
            print_error(f"Exception: {str(e)}")
    
    print_info(f"\n{'='*80}")
    print_info(f"Media Tests: {tests_passed}/{tests_total} passed")
    print_info(f"{'='*80}")
    
    return tests_passed == tests_total

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================
def main():
    print("\n" + "="*80)
    print("THRETHA COUTURE BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin Email: {ADMIN_EMAIL}")
    print("="*80 + "\n")
    
    results = {}
    
    # Run all tests in order
    results['Health Check'] = test_health()
    results['Public Settings'] = test_public_settings()
    results['Categories List'] = test_categories()
    results['Products Listing'] = test_products_listing()
    results['Product Detail'] = test_product_detail()
    results['Create Order'] = test_create_order()
    results['Admin Login'] = test_admin_login()
    results['Auth Protection'] = test_auth_protection()
    results['Admin Products CRUD'] = test_admin_products()
    results['Admin Categories CRUD'] = test_admin_categories()
    results['Admin Orders'] = test_admin_orders()
    results['Admin Settings'] = test_admin_settings()
    results['Media Upload & Serve'] = test_media()
    
    # Print final summary
    print("\n" + "="*80)
    print("FINAL TEST SUMMARY")
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
    print(f"Total: {passed + failed} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print("="*80 + "\n")
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
