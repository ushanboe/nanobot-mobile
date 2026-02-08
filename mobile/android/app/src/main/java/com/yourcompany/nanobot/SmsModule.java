package com.yourcompany.nanobot;

import android.Manifest;
import android.content.ContentResolver;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.telephony.SmsManager;

import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.ArrayList;

public class SmsModule extends ReactContextBaseJavaModule {

    SmsModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "SmsModule";
    }

    @ReactMethod
    public void getMessages(ReadableMap filter, int count, Promise promise) {
        ReactApplicationContext context = getReactApplicationContext();

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS)
                != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "READ_SMS permission not granted");
            return;
        }

        try {
            String box = filter.hasKey("box") ? filter.getString("box") : "inbox";
            String search = filter.hasKey("search") ? filter.getString("search") : "";
            String address = filter.hasKey("address") ? filter.getString("address") : "";

            Uri uri;
            switch (box) {
                case "sent":
                    uri = Uri.parse("content://sms/sent");
                    break;
                case "all":
                    uri = Uri.parse("content://sms/");
                    break;
                default:
                    uri = Uri.parse("content://sms/inbox");
                    break;
            }

            String selection = null;
            ArrayList<String> selectionArgs = new ArrayList<>();

            if (search != null && !search.isEmpty()) {
                selection = "body LIKE ?";
                selectionArgs.add("%" + search + "%");
            }
            if (address != null && !address.isEmpty()) {
                selection = (selection != null ? selection + " AND " : "") + "address LIKE ?";
                selectionArgs.add("%" + address + "%");
            }

            String[] args = selectionArgs.isEmpty() ? null : selectionArgs.toArray(new String[0]);
            int limit = Math.min(Math.max(count, 1), 100);

            ContentResolver cr = context.getContentResolver();
            Cursor cursor = cr.query(
                uri,
                new String[]{"_id", "address", "body", "date", "type", "read"},
                selection,
                args,
                "date DESC LIMIT " + limit
            );

            WritableArray result = Arguments.createArray();

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    WritableMap msg = Arguments.createMap();
                    msg.putString("id", cursor.getString(0));
                    msg.putString("address", cursor.getString(1) != null ? cursor.getString(1) : "");
                    msg.putString("body", cursor.getString(2) != null ? cursor.getString(2) : "");
                    msg.putDouble("date", cursor.getLong(3));
                    msg.putInt("type", cursor.getInt(4));
                    msg.putBoolean("read", cursor.getInt(5) == 1);
                    result.pushMap(msg);
                }
                cursor.close();
            }

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SMS_READ_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void sendMessage(String phoneNumber, String body, Promise promise) {
        ReactApplicationContext context = getReactApplicationContext();

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
                != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "SEND_SMS permission not granted");
            return;
        }

        try {
            SmsManager smsManager = SmsManager.getDefault();

            if (body.length() > 160) {
                ArrayList<String> parts = smsManager.divideMessage(body);
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null);
            } else {
                smsManager.sendTextMessage(phoneNumber, null, body, null, null);
            }

            WritableMap result = Arguments.createMap();
            result.putBoolean("success", true);
            result.putString("message", "SMS sent to " + phoneNumber);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SMS_SEND_ERROR", e.getMessage(), e);
        }
    }
}
