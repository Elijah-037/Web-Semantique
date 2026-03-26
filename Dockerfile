# ─── Stage 1 : installation des dépendances Composer ────────────────────────
# On utilise l'image officielle composer (contient git/unzip/curl)
# Ces outils n'atterriront PAS dans l'image finale.
FROM composer:latest AS deps

WORKDIR /app

COPY src/composer.json src/composer.lock* ./
COPY src/patches/ ./patches/

RUN composer install \
        --no-interaction \
        --prefer-dist \
        --no-dev \
        --optimize-autoloader

# ─── Stage 2 : image de production ───────────────────────────────────────────
FROM php:8.3-apache

# Installer les headers de compilation, compiler les extensions PHP,
# puis supprimer les headers (inutiles à runtime) dans le même layer
# pour ne pas alourdir l'image finale.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libxml2-dev libonig-dev \
    && docker-php-ext-install xml mbstring \
    && docker-php-ext-enable opcache \
    && apt-get purge -y --auto-remove libxml2-dev libonig-dev \
    && rm -rf /var/lib/apt/lists/*

# Configuration PHP de production
RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# OPcache : configuration pour la production
#   validate_timestamps=0 → PHP ne vérifie plus les fichiers sur disque (code figé en prod)
#   revalidate_freq=0     → cohérent avec validate_timestamps=0
RUN { \
        echo "opcache.enable=1"; \
        echo "opcache.memory_consumption=128"; \
        echo "opcache.interned_strings_buffer=8"; \
        echo "opcache.max_accelerated_files=4000"; \
        echo "opcache.validate_timestamps=0"; \
        echo "opcache.revalidate_freq=0"; \
        echo "opcache.fast_shutdown=1"; \
    } > "$PHP_INI_DIR/conf.d/opcache-prod.ini"

# Activer mod_rewrite + DocumentRoot → /var/www/html/public
RUN a2enmod rewrite \
    && sed -i 's|/var/www/html|/var/www/html/public|g' \
        /etc/apache2/sites-available/000-default.conf \
    && echo '<Directory /var/www/html/public>\n\tAllowOverride All\n</Directory>' \
        >> /etc/apache2/apache2.conf

WORKDIR /var/www/html

# Récupérer vendor/ depuis le stage builder (sans git/unzip/curl)
COPY --from=deps /app/vendor ./vendor

# Copier le code source et l'ontologie OWL
COPY src/ ./
COPY Assets/ /var/www/assets/

# Permissions Apache
RUN chown -R www-data:www-data /var/www/html /var/www/assets \
    && find /var/www/html -type d -exec chmod 755 {} \; \
    && find /var/www/html -type f -exec chmod 644 {} \;

ENV OWL_FILE_PATH=/var/www/assets/AfricanWildlifeOntology1.owl
ENV APP_DEBUG=false

EXPOSE 80
