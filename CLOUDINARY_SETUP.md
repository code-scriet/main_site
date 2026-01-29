# Cloudinary Image Upload Setup Guide

## 📸 Why Cloudinary?

- ✅ **Free tier**: 25GB storage, 25GB bandwidth/month
- ✅ **Fast CDN**: Images load quickly worldwide
- ✅ **Auto-optimization**: WebP conversion, quality optimization
- ✅ **Transformations**: Resize, crop, effects on-the-fly
- ✅ **Direct URLs**: No permission issues like Google Drive

---

## 🚀 Setup Steps

### 1. Create Cloudinary Account

1. Go to https://cloudinary.com/users/register_free
2. Sign up with your email
3. Verify your email

### 2. Get Your Credentials

After logging in:
1. Go to **Dashboard** (https://cloudinary.com/console)
2. You'll see:
   - **Cloud Name**: e.g., `your-cloud-name`
   - **API Key**: e.g., `123456789012345`
   - **API Secret**: Click "👁️ Show" to reveal

### 3. Add to Environment Variables

Open your `.env` file and add:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your_secret_here
```

**⚠️ Important**: 
- Never commit `.env` to git
- These credentials are in `.env.example` as placeholders
- Each developer needs their own `.env` file

### 4. Restart Your Server

```bash
# Stop the server (Ctrl+C)
npm run dev
```

---

## 📤 How to Upload Images

### Method 1: Direct Upload via Dashboard (Easiest)

1. Log into Cloudinary dashboard
2. Go to **Media Library**
3. Click **Upload**
4. Upload your image
5. Click the image → Copy URL
6. Paste URL in event form

Example URL:
```
https://res.cloudinary.com/your-cloud-name/image/upload/v1234567890/sample.jpg
```

### Method 2: Upload via API (Programmatic)

Use the upload endpoint from your app:

**Endpoint**: `POST /api/upload/image`  
**Auth**: Required (Core Member or Admin)  
**Body**: `multipart/form-data` with `image` field

**Example using curl:**
```bash
curl -X POST http://localhost:5001/api/upload/image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@/path/to/image.jpg"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://res.cloudinary.com/your-cloud-name/image/upload/v1234/abc123.jpg",
    "publicId": "club-events/abc123",
    "width": 1920,
    "height": 1080,
    "format": "jpg"
  }
}
```

### Method 3: Frontend Upload Component (Coming Soon)

A drag-and-drop upload component in the event form will be added.

---

## 🎨 Image Best Practices

### Recommended Sizes

- **Event Cover**: 1920x1080px (landscape)
- **Gallery Images**: 1200x800px minimum
- **Format**: JPG or PNG
- **Size**: Under 5MB per image

### Image Transformations

Cloudinary automatically optimizes your images:
- Converts to WebP for supported browsers
- Compresses without visible quality loss
- Generates responsive sizes

You can also manually transform images by modifying the URL:

**Original:**
```
https://res.cloudinary.com/demo/image/upload/sample.jpg
```

**Resized to 800px width:**
```
https://res.cloudinary.com/demo/image/upload/w_800/sample.jpg
```

**Cropped and resized:**
```
https://res.cloudinary.com/demo/image/upload/w_800,h_600,c_fill/sample.jpg
```

---

## 🔒 Security

- **API Secret**: Never expose in frontend code
- **Upload endpoint**: Protected by authentication
- **Only Core Members**: Can upload images
- **Signed URLs**: All uploads are signed server-side

---

## 📊 Usage Monitoring

Monitor your usage at: https://cloudinary.com/console/usage

**Free Tier Limits:**
- 25 GB storage
- 25 GB bandwidth/month
- 25,000 transformations/month

**If you exceed:**
- Upgrade to paid plan ($89/month)
- Or optimize images (delete unused, reduce size)

---

## 🛠️ Troubleshooting

### "Image upload is not configured"

**Problem**: Missing environment variables  
**Solution**: 
1. Check `.env` file exists
2. Verify all three variables are set
3. Restart server

### "Failed to upload image"

**Problem**: Network or API error  
**Solution**:
1. Check Cloudinary dashboard is accessible
2. Verify API credentials are correct
3. Check image size (must be under 5MB)

### "401 Unauthorized"

**Problem**: Not logged in or wrong role  
**Solution**:
1. Log in as Core Member or Admin
2. Check JWT token is valid

---

## 🎯 Next Steps

1. ✅ Set up Cloudinary account
2. ✅ Add credentials to `.env`
3. ✅ Restart server
4. ✅ Upload test image via dashboard
5. ✅ Copy URL and create an event
6. ✅ Verify image loads on event page

**Need help?** Check Cloudinary docs: https://cloudinary.com/documentation
