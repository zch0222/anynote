package com.anynote.ai.security.credential;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Objects;
import java.util.function.Supplier;

/**
 * 模型供应商凭据的 AES-GCM 加解密组件。
 *
 * <p>密文格式为 {@code Base64(iv || ciphertext || tag)}：iv 固定 12 字节，tag 固定 128 位；
 * 主密钥从环境变量 {@value #MASTER_KEY_ENV} 读取，取值为 Base64 编码的 32 字节。</p>
 *
 * <p>安全约定：主密钥既不出现在配置、数据库、日志中，也不随快照下发；本类只负责加解密，
 * 不做任何日志输出。主密钥缺失或格式不正确时，加解密统一抛出
 * {@link BusinessException}，错误信息为“模型供应商凭据主密钥未配置或格式不正确”。</p>
 *
 * @author 称霸幼儿园
 */
@Component
public class AesGcmCipher {

    /**
     * 主密钥环境变量名，值为 Base64 编码的 32 字节密钥。
     */
    public static final String MASTER_KEY_ENV = "ANYNOTE_AI_CREDENTIAL_KEY";

    /** 主密钥字节长度（AES-256）。 */
    private static final int MASTER_KEY_BYTES = 32;

    /** GCM iv 字节长度。 */
    private static final int IV_BYTES = 12;

    /** GCM tag 位数。 */
    private static final int TAG_BITS = 128;

    /** 加解密算法。 */
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    /** 主密钥缺失/格式错误提示。 */
    private static final String MASTER_KEY_ERROR_MESSAGE = "模型供应商凭据主密钥未配置或格式不正确";

    /** 密文非法/解密失败提示。 */
    private static final String DECRYPT_ERROR_MESSAGE = "模型供应商凭据解密失败";

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final Supplier<String> masterKeyBase64Supplier;

    /**
     * 生产构造器：在每次加解密时从环境变量读取主密钥，未配置时不会阻断应用启动。
     */
    public AesGcmCipher() {
        this(() -> System.getenv(MASTER_KEY_ENV));
    }

    /**
     * 自定义主密钥来源的构造器：生产环境由 Spring 使用无参构造器（读环境变量），
     * 单元测试或需要显式传入密钥来源的场景使用本构造器。
     *
     * @param masterKeyBase64Supplier 返回 Base64 主密钥的供给器，允许返回 {@code null}
     */
    public AesGcmCipher(Supplier<String> masterKeyBase64Supplier) {
        this.masterKeyBase64Supplier = Objects.requireNonNull(masterKeyBase64Supplier);
    }

    /**
     * 加密明文凭据。
     *
     * @param plain 明文，不能为 {@code null}
     * @return Base64(iv || ciphertext || tag)
     * @throws BusinessException 主密钥未配置/格式错误，或加密失败
     */
    public String encrypt(String plain) {
        if (plain == null) {
            throw new BusinessException("模型供应商凭据明文不能为空", ResCode.BUSINESS_ERROR);
        }
        SecretKeySpec masterKey = resolveMasterKey();
        byte[] iv = new byte[IV_BYTES];
        SECURE_RANDOM.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, masterKey, new GCMParameterSpec(TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (GeneralSecurityException e) {
            throw new BusinessException("模型供应商凭据加密失败", ResCode.BUSINESS_ERROR);
        }
    }

    /**
     * 解密密文凭据。
     *
     * @param cipherText Base64(iv || ciphertext || tag)，不能为 {@code null}
     * @return 明文
     * @throws BusinessException 主密钥未配置/格式错误、密文非 Base64 或校验失败（错误密钥、密文被篡改）
     */
    public String decrypt(String cipherText) {
        if (cipherText == null) {
            throw new BusinessException(DECRYPT_ERROR_MESSAGE, ResCode.BUSINESS_ERROR);
        }
        SecretKeySpec masterKey = resolveMasterKey();
        byte[] combined;
        try {
            combined = Base64.getDecoder().decode(cipherText);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(DECRYPT_ERROR_MESSAGE, ResCode.BUSINESS_ERROR);
        }
        if (combined.length <= IV_BYTES) {
            throw new BusinessException(DECRYPT_ERROR_MESSAGE, ResCode.BUSINESS_ERROR);
        }
        byte[] iv = Arrays.copyOfRange(combined, 0, IV_BYTES);
        byte[] encrypted = Arrays.copyOfRange(combined, IV_BYTES, combined.length);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, masterKey, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new BusinessException(DECRYPT_ERROR_MESSAGE, ResCode.BUSINESS_ERROR);
        }
    }

    /**
     * 解析并校验主密钥。
     *
     * @return AES 主密钥
     * @throws BusinessException 未配置、不是合法 Base64 或长度不是 32 字节
     */
    private SecretKeySpec resolveMasterKey() {
        String masterKeyBase64 = masterKeyBase64Supplier.get();
        if (masterKeyBase64 == null || masterKeyBase64.trim().isEmpty()) {
            throw new BusinessException(MASTER_KEY_ERROR_MESSAGE, ResCode.BUSINESS_ERROR);
        }
        byte[] masterKeyBytes;
        try {
            masterKeyBytes = Base64.getDecoder().decode(masterKeyBase64.trim());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(MASTER_KEY_ERROR_MESSAGE, ResCode.BUSINESS_ERROR);
        }
        if (masterKeyBytes.length != MASTER_KEY_BYTES) {
            throw new BusinessException(MASTER_KEY_ERROR_MESSAGE, ResCode.BUSINESS_ERROR);
        }
        return new SecretKeySpec(masterKeyBytes, "AES");
    }
}
