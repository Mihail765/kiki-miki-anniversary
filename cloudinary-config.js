const CLOUDINARY_CONFIG = {
  cloudName: "dc59eomk8",
  uploadPreset: "anniversary_uploads",
};

// ===== WHY THESE SETTINGS =====
// Max 1920px: timeline cards display at ~800px wide, 1920px gives 2x for retina screens
//             — going to 2560px just wastes storage with zero visible benefit
// Quality 82: WebP at 82% is visually identical to JPEG at 92% but ~50% smaller
//             — human eyes cannot tell the difference on photos at this level
// No cropping: aspect ratio is always preserved, image is only scaled down if too large
// WebP first:  supported by 97%+ of browsers — falls back to JPEG only if needed

const IMAGE_SETTINGS = {
  maxWidth: 1920,
  maxHeight: 1920,
  webpQuality: 0.82,
  jpegQuality: 0.85, // slightly higher for JPEG fallback since it compresses less efficiently
};

// ===== CHECK WEBP ENCODING SUPPORT =====
function supportsWebP() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

// ===== RESIZE PROPORTIONALLY — NO CROPPING =====
function getResizedDimensions(width, height) {
  const max = IMAGE_SETTINGS.maxWidth;

  if (width <= max && height <= max) {
    // Already small enough — don't upscale, keep original size
    return { width: Math.round(width), height: Math.round(height) };
  }

  // Scale down the longer side to max, shorter side follows aspect ratio
  const ratio = Math.min(max / width, max / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

// ===== COMPRESS + CONVERT TO WEBP (or JPEG fallback) =====
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const useWebP = supportsWebP();
    const outputFormat = useWebP ? "image/webp" : "image/jpeg";
    const outputQuality = useWebP
      ? IMAGE_SETTINGS.webpQuality
      : IMAGE_SETTINGS.jpegQuality;
    const outputExtension = useWebP ? ".webp" : ".jpg";

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image"));

      img.onload = () => {
        const { width, height } = getResizedDimensions(img.width, img.height);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas toBlob failed"));
              return;
            }

            const newName = file.name.replace(/\.[^/.]+$/, outputExtension);
            const compressedFile = new File([blob], newName, {
              type: outputFormat,
            });

            const originalMB = (file.size / 1024 / 1024).toFixed(2);
            const compressedMB = (blob.size / 1024 / 1024).toFixed(2);
            const savings = ((1 - blob.size / file.size) * 100).toFixed(0);

            console.log(`📦 Image compressed`);
            console.log(
              `   Format:     ${outputFormat} at ${outputQuality * 100}% quality`,
            );
            console.log(
              `   Dimensions: ${img.width}x${img.height}px → ${width}x${height}px`,
            );
            console.log(
              `   File size:  ${originalMB}MB → ${compressedMB}MB (${savings}% smaller)`,
            );

            resolve(compressedFile);
          },
          outputFormat,
          outputQuality,
        );
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

// ===== UPLOAD TO CLOUDINARY =====
async function uploadImageToCloudinary(file, folder = "memories") {
  try {
    console.log(
      `📤 Uploading: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB original)`,
    );

    const compressedFile = await compressImage(file);

    const formData = new FormData();
    formData.append("file", compressedFile);
    formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
    formData.append("folder", folder);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
      { method: "POST", body: formData },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        "Upload failed: " + (errorData.error?.message || response.statusText),
      );
    }

    const data = await response.json();

    console.log(`✅ Uploaded`);
    console.log(`   Stored format: ${data.format}`);
    console.log(`   Stored size:   ${(data.bytes / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Dimensions:    ${data.width}x${data.height}px`);
    console.log(`   URL:           ${data.secure_url}`);

    return data.secure_url;
  } catch (error) {
    console.error("❌ Upload error:", error);
    throw error;
  }
}

console.log("✅ Cloudinary ready");
console.log(
  `   Max resolution: ${IMAGE_SETTINGS.maxWidth}x${IMAGE_SETTINGS.maxHeight}px (retina-safe)`,
);
console.log(
  `   WebP quality:   ${IMAGE_SETTINGS.webpQuality * 100}% (visually lossless)`,
);
console.log(`   JPEG fallback:  ${IMAGE_SETTINGS.jpegQuality * 100}%`);
console.log(`   Cropping:       disabled`);
