package fr.warboost.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name="WarBoostSecureStorage")
public class WarBoostSecureStorage extends Plugin {
    private static final String ALIAS="warboost.session.v1";
    private SecretKey key() throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(!ks.containsAlias(ALIAS)) {
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey)ks.getKey(ALIAS,null);
    }
    @PluginMethod public void readSession(PluginCall call) {
        try {
            var prefs=getContext().getSharedPreferences(ALIAS,0);
            String value=prefs.getString("ciphertext",null),plain="{}";
            if(value!=null) {
                Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(prefs.getString("iv",""),Base64.NO_WRAP)));
                plain=new String(cipher.doFinal(Base64.decode(value,Base64.NO_WRAP)),java.nio.charset.StandardCharsets.UTF_8);
            }
            JSObject result=new JSObject();result.put("value",plain);call.resolve(result);
        } catch(Exception error) {call.reject("Secure session unavailable");}
    }
    @PluginMethod public void writeSession(PluginCall call) {
        try {
            String value=call.getString("value");
            if(value==null||value.length()>100000)throw new IllegalArgumentException();
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
            String encrypted=Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP);
            boolean saved=getContext().getSharedPreferences(ALIAS,0).edit()
                .putString("ciphertext",encrypted).putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).commit();
            if(!saved)throw new IllegalStateException();
            call.resolve();
        } catch(Exception error) {call.reject("Secure session not saved");}
    }
}
