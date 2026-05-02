package com.anynote.common.swagger.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(SwaggerProperties.class)
@ConditionalOnProperty(name = "swagger.enabled", matchIfMissing = true)
public class SwaggerAutoConfiguration {

    private static final String SECURITY_SCHEME_NAME = "Authorization";

    @Bean
    public OpenAPI openAPI(SwaggerProperties props) {
        SwaggerProperties.Contact c = props.getContact();
        return new OpenAPI()
                .info(new Info()
                        .title(props.getTitle())
                        .description(props.getDescription())
                        .version(props.getVersion())
                        .license(new License().name(props.getLicense()).url(props.getLicenseUrl()))
                        .termsOfService(props.getTermsOfServiceUrl())
                        .contact(new Contact()
                                .name(c.getName())
                                .url(c.getUrl())
                                .email(c.getEmail())))
                .addSecurityItem(new SecurityRequirement().addList(SECURITY_SCHEME_NAME))
                .components(new Components()
                        .addSecuritySchemes(SECURITY_SCHEME_NAME, new SecurityScheme()
                                .name(SECURITY_SCHEME_NAME)
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)));
    }
}
