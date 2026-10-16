package com.example.cameraapp;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

@CapacitorPlugin(name = "Gallery")
public class GalleryPlugin extends Plugin {
    @PluginMethod
    public void saveVideo(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("MediaStore gallery save requires Android 10 or newer");
            return;
        }

        String fileName = call.getString("fileName");
        String encodedData = call.getString("data");
        if (fileName == null || encodedData == null) {
            call.reject("fileName and data are required");
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Video.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
        values.put(
            MediaStore.Video.Media.RELATIVE_PATH,
            Environment.DIRECTORY_MOVIES + "/CameraApp"
        );
        values.put(MediaStore.Video.Media.IS_PENDING, 1);

        Uri videoUri = resolver.insert(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            values
        );
        if (videoUri == null) {
            call.reject("Could not create a video entry in MediaStore");
            return;
        }

        try (OutputStream output = resolver.openOutputStream(videoUri)) {
            if (output == null) {
                throw new IllegalStateException("Could not open MediaStore output stream");
            }
            output.write(Base64.decode(encodedData, Base64.DEFAULT));
            output.flush();

            ContentValues completedValues = new ContentValues();
            completedValues.put(MediaStore.Video.Media.IS_PENDING, 0);
            resolver.update(videoUri, completedValues, null, null);

            JSObject result = new JSObject();
            result.put("uri", videoUri.toString());
            call.resolve(result);
        } catch (Exception error) {
            resolver.delete(videoUri, null, null);
            call.reject("Could not save video to the gallery", error);
        }
    }
}
