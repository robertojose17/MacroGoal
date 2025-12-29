
# Photo Upload Testing Guide 📸

## Quick Start

This guide will help you test the newly fixed photo upload functionality for weight check-ins.

## Prerequisites

✅ Storage bucket created (`check-ins`)  
✅ RLS policies applied  
✅ Dependencies installed (`expo-image-manipulator`)  
✅ App running on physical device or simulator  

## Test Scenarios

### 1. Basic Photo Upload (Happy Path) ✅

**Steps:**
1. Open the app
2. Navigate to **Check-Ins** tab
3. Tap **"New Weight Check-In"**
4. Enter weight (e.g., 180)
5. Tap **"Choose Photo"** or **"Take Photo"**
6. Select/take a photo
7. Tap **"Save Check-In"**

**Expected Result:**
- ✅ Alert shows: "Check-in saved successfully"
- ✅ NO error message about photo upload
- ✅ Console shows: "✅ Photo uploaded successfully"
- ✅ Console shows: "🔗 Public URL: https://..."

**Console Logs to Look For:**
```
[CheckInForm] 📸 New photo selected, uploading...
[CheckInForm] 📤 Uploading photo (attempt 1 of 2)...
[ImageUtils] ✅ Image compressed successfully
[CheckInForm] ✅ Blob created, size: XXXXX bytes
[CheckInForm] ✅ Photo uploaded successfully
[CheckInForm] 🔗 Public URL: https://...
[CheckInForm] ✅ Check-in created successfully
```

---

### 2. Verify Photo in Dashboard 📊

**Steps:**
1. After creating check-in with photo (from Test 1)
2. Navigate to **Dashboard** tab
3. Scroll to **"Photo Progress"** card

**Expected Result:**
- ✅ Photo Progress card shows your uploaded photo
- ✅ Date matches the check-in date
- ✅ Photo is displayed correctly (not broken/missing)

---

### 3. Large Photo Compression 🗜️

**Steps:**
1. Take a high-resolution photo (4000x3000px or larger)
2. Create a new weight check-in
3. Upload the large photo
4. Check console logs

**Expected Result:**
- ✅ Photo is compressed before upload
- ✅ Console shows: "Image compressed successfully"
- ✅ Upload completes successfully
- ✅ Final file size is reasonable (< 500KB typically)

**Console Logs to Look For:**
```
[ImageUtils] Compressing image: file:///...
[ImageUtils] ✅ Image compressed successfully
[CheckInForm] ✅ Blob created, size: 245678 bytes  // Should be smaller than original
```

---

### 4. Camera Permission 📷

**Steps:**
1. Create new weight check-in
2. Tap **"Take Photo"**
3. If prompted, **deny** camera permission
4. Observe alert
5. Go to device settings and grant permission
6. Try again

**Expected Result:**
- ✅ Alert shows: "Camera permission is required to take photos"
- ✅ After granting permission, camera opens successfully
- ✅ Photo can be taken and uploaded

---

### 5. Gallery Permission 🖼️

**Steps:**
1. Create new weight check-in
2. Tap **"Choose Photo"**
3. If prompted, **deny** gallery permission
4. Observe alert
5. Go to device settings and grant permission
6. Try again

**Expected Result:**
- ✅ Alert shows: "Photo library permission is required to choose photos"
- ✅ After granting permission, gallery opens successfully
- ✅ Photo can be selected and uploaded

---

### 6. Edit Check-In with Photo 📝

**Steps:**
1. Create a check-in with a photo
2. Go back to Check-Ins tab
3. Tap on the check-in you just created
4. Tap **"Edit"** (if available) or navigate to edit screen
5. Verify photo is displayed
6. Optionally change photo or remove it
7. Save changes

**Expected Result:**
- ✅ Existing photo is displayed in edit form
- ✅ Can remove photo by tapping trash icon
- ✅ Can replace photo with new one
- ✅ Changes are saved successfully

---

### 7. Multiple Check-Ins with Photos 📅

**Steps:**
1. Create 3 check-ins on different dates, each with a photo
2. Go to Dashboard
3. Check Photo Progress card

**Expected Result:**
- ✅ Photo Progress card shows earliest and most recent photos by default
- ✅ Can select different dates using the date chips
- ✅ Photos update when different dates are selected
- ✅ Arrow between photos indicates progression

---

### 8. Check-In Without Photo (Optional) 🚫

**Steps:**
1. Create new weight check-in
2. Enter weight
3. **Do NOT** add a photo
4. Tap "Save Check-In"

**Expected Result:**
- ✅ Check-in saves successfully
- ✅ No error messages
- ✅ Check-in appears in list without photo
- ✅ Photo Progress card does NOT include this check-in

---

### 9. Network Error Simulation (Advanced) 🌐

**Steps:**
1. Start creating a check-in with photo
2. Enter weight and select photo
3. Enable **Airplane Mode** on device
4. Tap "Save Check-In"
5. Wait for retry attempt
6. Disable Airplane Mode
7. Observe result

**Expected Result:**
- ✅ First upload attempt fails
- ✅ Console shows: "🔄 Retrying upload..."
- ✅ Second attempt succeeds (if network restored)
- ✅ OR alert shows: "Photo upload failed, but check-in will be saved without it"
- ✅ Check-in is saved regardless

**Console Logs to Look For:**
```
[CheckInForm] ❌ Upload error: Network request failed
[CheckInForm] 🔄 Retrying upload...
[CheckInForm] 📤 Uploading photo (attempt 2 of 2)...
```

---

## Common Issues & Solutions

### Issue: "Photo upload failed" message appears

**Possible Causes:**
1. Storage bucket not created
2. RLS policies not applied
3. User not authenticated
4. Network connectivity issues
5. File too large (> 5MB)

**Solutions:**
1. Check storage bucket exists:
   ```sql
   SELECT * FROM storage.buckets WHERE id = 'check-ins';
   ```
2. Verify RLS policies are applied
3. Ensure user is logged in
4. Check network connection
5. Try with a smaller image

---

### Issue: Photo doesn't appear in Photo Progress card

**Possible Causes:**
1. `photo_url` not saved in database
2. Public URL not accessible
3. Dashboard not refreshed

**Solutions:**
1. Check database:
   ```sql
   SELECT id, date, photo_url FROM check_ins WHERE photo_url IS NOT NULL;
   ```
2. Copy URL and open in browser to verify accessibility
3. Pull down to refresh Dashboard

---

### Issue: Image compression fails

**Possible Causes:**
1. Invalid image URI
2. Corrupted image file
3. Unsupported image format

**Solutions:**
1. Try with a different image
2. Check console logs for detailed error
3. Ensure image is JPEG, PNG, or WebP

---

## Console Log Reference

### Success Indicators ✅

- `✅ Image compressed successfully`
- `✅ Blob created, size: XXXXX bytes`
- `✅ Photo uploaded successfully`
- `🔗 Public URL: https://...`
- `✅ Check-in created successfully`

### Warning Indicators ⚠️

- `🔄 Retrying upload...`
- `⚠️ Photo upload failed, but check-in will be saved without it`

### Error Indicators ❌

- `❌ Upload error: ...`
- `❌ Photo upload failed after 2 attempts`
- `❌ Error in uploadPhoto: ...`

---

## Performance Benchmarks

### Expected Upload Times

- **Small image** (< 500KB): 1-3 seconds
- **Medium image** (500KB - 2MB): 3-8 seconds
- **Large image** (2MB - 5MB): 8-15 seconds

### Expected Compression Results

- **Original**: 4000x3000px, 3.5MB
- **Compressed**: 1200x900px, 250KB
- **Compression Ratio**: ~93% reduction

---

## Checklist for Complete Testing

- [ ] Basic photo upload works
- [ ] Photo appears in Dashboard
- [ ] Large photos are compressed
- [ ] Camera permission handled correctly
- [ ] Gallery permission handled correctly
- [ ] Can edit check-in with photo
- [ ] Multiple check-ins with photos work
- [ ] Check-in without photo works
- [ ] Network error retry works (optional)
- [ ] Console logs show expected messages

---

## Reporting Issues

If you find any issues during testing, please provide:

1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Console logs** (copy relevant logs)
5. **Device/simulator info** (iOS/Android, version)
6. **Network conditions** (WiFi, cellular, offline)

---

**Happy Testing! 🎉**

If all tests pass, the photo upload functionality is working correctly and ready for production use.
