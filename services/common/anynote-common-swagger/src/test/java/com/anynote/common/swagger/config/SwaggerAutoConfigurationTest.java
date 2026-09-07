package com.anynote.common.swagger.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SwaggerAutoConfigurationTest {
    @Test
    void advertisesJwtBearerInsteadOfLegacyApiKeyAuthentication() {
        OpenAPI api = new SwaggerAutoConfiguration().openAPI(new SwaggerProperties());
        SecurityScheme scheme = api.getComponents().getSecuritySchemes().get("Authorization");
        assertThat(scheme.getType()).isEqualTo(SecurityScheme.Type.HTTP);
        assertThat(scheme.getScheme()).isEqualTo("bearer");
        assertThat(scheme.getBearerFormat()).isEqualTo("JWT");
        assertThat(scheme.getIn()).isNull();
        assertThat(api.getSecurity()).singleElement().satisfies(requirement ->
                assertThat(requirement).containsKey("Authorization"));
    }
}
