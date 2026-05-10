import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim()
});

async function migrate() {
  try {
    const folder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
    
    console.log('🚀 Starting migration to Cloudinary...');
    console.log(`📁 Using folder: ${folder}`);
    
    // Upload events.json
    console.log('\n📤 Uploading events.json...');
    const eventsData = await fs.readFile('data/events.json', 'utf8');
    const eventsBuffer = Buffer.from(eventsData);
    const eventsBase64 = `data:application/json;base64,${eventsBuffer.toString('base64')}`;
    
    const eventsResult = await cloudinary.uploader.upload(eventsBase64, {
      public_id: `${folder}/data/events.json`,
      resource_type: 'raw',
      overwrite: true
    });
    console.log(`✅ Events uploaded: ${eventsResult.secure_url}`);
    
    // Upload photos.json
    console.log('\n📤 Uploading photos.json...');
    const photosData = await fs.readFile('data/photos.json', 'utf8');
    const photosBuffer = Buffer.from(photosData);
    const photosBase64 = `data:application/json;base64,${photosBuffer.toString('base64')}`;
    
    const photosResult = await cloudinary.uploader.upload(photosBase64, {
      public_id: `${folder}/data/photos.json`,
      resource_type: 'raw',
      overwrite: true
    });
    console.log(`✅ Photos uploaded: ${photosResult.secure_url}`);
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Events: ${JSON.parse(eventsData).length} records`);
    console.log(`   - Photos: ${JSON.parse(photosData).length} records`);
    console.log('\n💡 You can now deploy to Vercel!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    
    if (error.message.includes('ENOENT')) {
      console.log('\n💡 Tip: Make sure data/events.json and data/photos.json exist');
    } else if (error.message.includes('Invalid')) {
      console.log('\n💡 Tip: Check your Cloudinary credentials in .env file');
    }
    
    process.exit(1);
  }
}

migrate();
