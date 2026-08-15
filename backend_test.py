#!/usr/bin/env python3
"""
CLOUDINARY INTEGRATION TEST
Tests that uploads go to Cloudinary when CLOUDINARY_* env vars are set.
"""
import requests
import os
from io import BytesIO
from PIL import Image

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://kerala-drop.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

print(f"Testing against: {API_BASE}")
print("=" * 80)

# Admin credentials
ADMIN_EMAIL = "admin@threthacouture.com"
ADMIN_PASSWORD = "thretha@2026"

def test_admin_login():
    """Test 1: POST /api/admin/login -> get token"""
    print("\n[TEST 1] POST /api/admin/login")
    try:
        response = requests.post(
            f"{API_BASE}/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if 'token' in data:
                print(f"✅ PASSED - Login successful, token received")
                return data['token']
            else:
                print(f"❌ FAILED - No token in response: {data}")
                return None
        else:
            print(f"❌ FAILED - Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return None

def test_cloudinary_upload_with_token(token):
    """Test 2: POST /api/admin/media with token, file, folder='products' -> 200 with Cloudinary URL"""
    print("\n[TEST 2] POST /api/admin/media with Bearer token, file, and folder='products'")
    try:
        # Create a small test image
        img = Image.new('RGB', (100, 100), color='green')
        img_bytes = BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        headers = {'Authorization': f'Bearer {token}'}
        files = {'file': ('cloudinary-test.png', img_bytes, 'image/png')}
        data = {'folder': 'products'}
        
        response = requests.post(
            f"{API_BASE}/admin/media",
            headers=headers,
            files=files,
            data=data,
            timeout=15
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Response: {result}")
            
            # Check response structure
            if 'url' not in result or 'type' not in result:
                print(f"❌ FAILED - Missing url or type in response")
                return None
            
            # CRITICAL: Check that URL is Cloudinary (not local)
            if not result['url'].startswith('https://res.cloudinary.com/'):
                print(f"❌ FAILED - Expected Cloudinary URL (https://res.cloudinary.com/...), got: {result['url']}")
                print(f"⚠️  This indicates Cloudinary integration is NOT active!")
                return None
            
            # Check type is image
            if result['type'] != 'image':
                print(f"❌ FAILED - Expected type 'image', got: {result['type']}")
                return None
            
            # Check for public_id (Cloudinary-specific field)
            if 'public_id' not in result:
                print(f"⚠️  WARNING - Missing 'public_id' field (expected for Cloudinary)")
            else:
                print(f"Public ID: {result['public_id']}")
            
            print(f"✅ PASSED - Upload successful, Cloudinary URL returned: {result['url']}")
            return result['url']
        else:
            print(f"❌ FAILED - Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return None
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return None

def test_cloudinary_url_accessible(url):
    """Test 3: GET Cloudinary URL -> 200 with image content-type"""
    print(f"\n[TEST 3] GET Cloudinary URL (verify image is accessible)")
    try:
        print(f"URL: {url}")
        response = requests.get(url, timeout=10)
        
        print(f"Status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        
        if response.status_code == 200:
            content_type = response.headers.get('Content-Type', '')
            if 'image/' in content_type:
                print(f"✅ PASSED - Cloudinary image accessible with content-type: {content_type}")
                return True
            else:
                print(f"❌ FAILED - Wrong content-type: {content_type}")
                return False
        else:
            print(f"❌ FAILED - Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return False

def test_media_upload_no_token():
    """Test 4: POST /api/admin/media without token -> 401"""
    print("\n[TEST 4] POST /api/admin/media without token")
    try:
        # Create a small test image
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        files = {'file': ('test.png', img_bytes, 'image/png')}
        response = requests.post(f"{API_BASE}/admin/media", files=files, timeout=10)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 401:
            print("✅ PASSED - Correctly rejected upload without token (401)")
            return True
        else:
            print(f"❌ FAILED - Expected 401, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return False

def test_media_upload_no_file(token):
    """Test 5: POST /api/admin/media with token but no file -> 400"""
    print("\n[TEST 5] POST /api/admin/media with token but no file")
    try:
        headers = {'Authorization': f'Bearer {token}'}
        response = requests.post(
            f"{API_BASE}/admin/media",
            headers=headers,
            data={'folder': 'products'},
            timeout=10
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 400:
            print("✅ PASSED - Correctly rejected upload without file (400)")
            return True
        else:
            print(f"❌ FAILED - Expected 400, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return False

def test_products_list():
    """Test 6: GET /api/products -> 200"""
    print("\n[TEST 6] GET /api/products")
    try:
        response = requests.get(f"{API_BASE}/products", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Products count: {len(data)}")
            print("✅ PASSED - Products list retrieved successfully")
            return True
        else:
            print(f"❌ FAILED - Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return False

def test_settings():
    """Test 7: GET /api/settings -> 200 with whatsapp and hero.images (Cloudinary URLs)"""
    print("\n[TEST 7] GET /api/settings")
    try:
        response = requests.get(f"{API_BASE}/settings", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Check for whatsapp
            if 'whatsapp' not in data:
                print("❌ FAILED - Missing 'whatsapp' field")
                return False
            
            # Check for hero.images
            if 'hero' not in data or 'images' not in data['hero']:
                print("❌ FAILED - Missing 'hero.images' field")
                return False
            
            print(f"WhatsApp: {data['whatsapp']}")
            print(f"Hero images count: {len(data['hero']['images'])}")
            
            # Check if hero images are Cloudinary URLs (they should be after migration)
            hero_images = data['hero']['images']
            if hero_images and len(hero_images) > 0:
                first_image = hero_images[0]
                print(f"First hero image URL: {first_image}")
                if first_image.startswith('https://res.cloudinary.com/'):
                    print("✓ Hero images are Cloudinary URLs (migrated)")
                else:
                    print("✓ Hero images are local URLs (not yet migrated or seed data)")
            
            print("✅ PASSED - Settings retrieved with whatsapp and hero.images")
            return True
        else:
            print(f"❌ FAILED - Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return False

def test_categories():
    """Test 8: GET /api/categories -> 200 with 2 categories"""
    print("\n[TEST 8] GET /api/categories")
    try:
        response = requests.get(f"{API_BASE}/categories", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Categories count: {len(data)}")
            
            if len(data) >= 2:
                print("✅ PASSED - Categories list retrieved (2+ categories)")
                return True
            else:
                print(f"❌ FAILED - Expected at least 2 categories, got {len(data)}")
                return False
        else:
            print(f"❌ FAILED - Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return False

def test_admin_stats(token):
    """Test 9: GET /api/admin/stats with token -> 200"""
    print("\n[TEST 9] GET /api/admin/stats with Bearer token")
    try:
        headers = {'Authorization': f'Bearer {token}'}
        response = requests.get(f"{API_BASE}/admin/stats", headers=headers, timeout=10)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Stats: products={data.get('products')}, categories={data.get('categories')}, orders={data.get('orders')}")
            print("✅ PASSED - Admin stats retrieved successfully")
            return True
        else:
            print(f"❌ FAILED - Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return False

def test_create_order():
    """Test 10: POST /api/orders with valid product_id -> 200 with whatsapp.url starting https://wa.me/"""
    print("\n[TEST 10] POST /api/orders with valid product")
    try:
        # First get a product to use
        products_response = requests.get(f"{API_BASE}/products", timeout=10)
        if products_response.status_code != 200:
            print("❌ FAILED - Could not fetch products for test")
            return False
        
        products = products_response.json()
        if not products:
            print("❌ FAILED - No products available for test")
            return False
        
        product = products[0]
        print(f"Using product: {product['name']} (id: {product['id']})")
        
        # Create order
        order_data = {
            "customer": {
                "name": "Anjali Nair",
                "whatsapp": "919876543210",
                "house": "Sreelakshmi",
                "street": "Temple Road",
                "city": "Thrissur",
                "district": "Thrissur",
                "state": "Kerala",
                "pincode": "680001"
            },
            "item": {
                "product_id": product['id'],
                "size": "Free Size",
                "quantity": 1
            }
        }
        
        response = requests.post(f"{API_BASE}/orders", json=order_data, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Check for whatsapp.url
            if 'whatsapp' not in data or 'url' not in data['whatsapp']:
                print("❌ FAILED - Missing 'whatsapp.url' in response")
                print(f"Response: {data}")
                return False
            
            whatsapp_url = data['whatsapp']['url']
            print(f"WhatsApp URL: {whatsapp_url[:80]}...")
            
            # Check URL starts with https://wa.me/
            if not whatsapp_url.startswith('https://wa.me/'):
                print(f"❌ FAILED - WhatsApp URL doesn't start with 'https://wa.me/', got: {whatsapp_url[:50]}")
                return False
            
            print("✅ PASSED - Order created with correct WhatsApp URL format")
            return True
        else:
            print(f"❌ FAILED - Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAILED - Exception: {e}")
        return False

def main():
    """Run all Cloudinary integration tests"""
    print("\n" + "=" * 80)
    print("CLOUDINARY INTEGRATION TEST")
    print("Verifying uploads go to Cloudinary (not local disk)")
    print("=" * 80)
    
    results = []
    
    # Test 1: Admin login
    token = test_admin_login()
    results.append(("Admin login (POST /api/admin/login)", token is not None))
    
    if not token:
        print("\n❌ Cannot continue tests without admin token")
        print_summary(results)
        return
    
    # Test 2: Cloudinary upload with token and file
    cloudinary_url = test_cloudinary_upload_with_token(token)
    results.append(("Cloudinary upload (POST /api/admin/media with folder='products')", cloudinary_url is not None))
    
    # Test 3: Verify Cloudinary URL is accessible
    if cloudinary_url:
        results.append(("Cloudinary URL accessible (GET Cloudinary URL)", test_cloudinary_url_accessible(cloudinary_url)))
    else:
        results.append(("Cloudinary URL accessible", False))
        print("\n⚠️  Skipped - no Cloudinary URL available")
    
    # Test 4: Upload without token
    results.append(("Media upload without token (401)", test_media_upload_no_token()))
    
    # Test 5: Upload without file
    results.append(("Media upload without file (400)", test_media_upload_no_file(token)))
    
    # Test 6-10: Quick regression tests
    results.append(("GET /api/products", test_products_list()))
    results.append(("GET /api/settings (whatsapp + hero.images)", test_settings()))
    results.append(("GET /api/categories (2 cats)", test_categories()))
    results.append(("GET /api/admin/stats", test_admin_stats(token)))
    results.append(("POST /api/orders (WhatsApp URL)", test_create_order()))
    
    # Print summary
    print_summary(results, cloudinary_url)

def print_summary(results, cloudinary_url=None):
    """Print test summary"""
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed ({100*passed//total}%)")
    print("=" * 80)
    
    if cloudinary_url:
        print(f"\n📸 CLOUDINARY URL RETURNED: {cloudinary_url}")
        print("✓ This confirms Cloudinary integration is ACTIVE")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Cloudinary integration working correctly!")
        print("✓ Uploads go to Cloudinary (not local disk)")
        print("✓ Cloudinary URLs are accessible")
        print("✓ All validation and regression tests passed")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed - see details above")

if __name__ == "__main__":
    main()
