package com.anynote.ai.security.credential;

import com.anynote.core.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.security.SecureRandom;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * {@link AesGcmCipher} 的纯单测：加解密往返、错误密钥、密文篡改与主密钥缺失/格式错误。
 *
 * @author 称霸幼儿园
 */
class AesGcmCipherTest {

    private static final String TEST_PLAIN = "sk-测试凭据-1234567890";

    /**
     * 生成随机 32 字节主密钥的 Base64 表示。
     *
     * @return Base64 主密钥
     */
    private static String randomMasterKey() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }

    @Test
    @DisplayName("加密后解密得到原文")
    void shouldRoundTrip() {
        String masterKey = randomMasterKey();
        AesGcmCipher cipher = new AesGcmCipher(() -> masterKey);

        String encrypted = cipher.encrypt(TEST_PLAIN);

        assertNotEquals(TEST_PLAIN, encrypted);
        assertEquals(TEST_PLAIN, cipher.decrypt(encrypted));
    }

    @Test
    @DisplayName("用错误主密钥解密失败")
    void shouldFailToDecryptWithWrongMasterKey() {
        String keyA = randomMasterKey();
        byte[] keyBBytes = Base64.getDecoder().decode(keyA);
        keyBBytes[0] = (byte) (keyBBytes[0] ^ 0x01);
        String keyB = Base64.getEncoder().encodeToString(keyBBytes);
        String encrypted = new AesGcmCipher(() -> keyA).encrypt(TEST_PLAIN);

        AesGcmCipher wrongKeyCipher = new AesGcmCipher(() -> keyB);
        BusinessException exception = assertThrows(BusinessException.class,
                () -> wrongKeyCipher.decrypt(encrypted));
        assertEquals("模型供应商凭据解密失败", exception.getErrorMessage());
    }

    @Test
    @DisplayName("密文被篡改后解密失败")
    void shouldFailToDecryptTamperedCipherText() {
        String masterKey = randomMasterKey();
        AesGcmCipher cipher = new AesGcmCipher(() -> masterKey);
        String encrypted = cipher.encrypt(TEST_PLAIN);

        byte[] raw = Base64.getDecoder().decode(encrypted);
        raw[raw.length - 1] = (byte) (raw[raw.length - 1] ^ 0x01);
        String tampered = Base64.getEncoder().encodeToString(raw);

        assertThrows(BusinessException.class, () -> cipher.decrypt(tampered));
    }

    @Test
    @DisplayName("主密钥未配置时加解密报错")
    void shouldRejectWhenMasterKeyMissing() {
        AesGcmCipher cipher = new AesGcmCipher(() -> null);

        BusinessException encryptException = assertThrows(BusinessException.class, () -> cipher.encrypt(TEST_PLAIN));
        assertEquals("模型供应商凭据主密钥未配置或格式不正确", encryptException.getErrorMessage());
        assertThrows(BusinessException.class, () -> cipher.decrypt("AAAA"));
    }

    @Test
    @DisplayName("主密钥长度不是 32 字节时报错")
    void shouldRejectMasterKeyWithWrongLength() {
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]);
        AesGcmCipher cipher = new AesGcmCipher(() -> shortKey);

        BusinessException exception = assertThrows(BusinessException.class, () -> cipher.encrypt(TEST_PLAIN));
        assertEquals("模型供应商凭据主密钥未配置或格式不正确", exception.getErrorMessage());
    }

    @Test
    @DisplayName("主密钥不是合法 Base64 时报错")
    void shouldRejectMalformedMasterKey() {
        AesGcmCipher cipher = new AesGcmCipher(() -> "not-base64-!!!");
        assertThrows(BusinessException.class, () -> cipher.encrypt(TEST_PLAIN));
    }
}
