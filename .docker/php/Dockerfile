ARG PHP_VERSION=8.4
FROM php:${PHP_VERSION}-fpm-trixie AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
        libicu-dev libonig-dev libfreetype6-dev libpng-dev \
        libjpeg62-turbo-dev libzip-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" pdo_mysql zip intl gd mbstring

# Collect the binaries, extensions and their transitive shared-library dependencies.
# Canonical paths match Debian 13's merged /usr layout on both architectures.
RUN set -eux; \
    mkdir -p /runtime/usr/local/bin /runtime/usr/local/sbin \
        /runtime/usr/local/etc/php/conf.d /runtime/usr/local/lib/php \
        /runtime/var/www/data; \
    cp /usr/local/bin/php /runtime/usr/local/bin/; \
    cp /usr/local/sbin/php-fpm /runtime/usr/local/sbin/; \
    cp -a /usr/local/lib/php/extensions /runtime/usr/local/lib/php/; \
    cp /usr/local/etc/php/conf.d/*.ini /runtime/usr/local/etc/php/conf.d/; \
    for library in $(ldd /usr/local/bin/php /usr/local/sbin/php-fpm \
        /usr/local/lib/php/extensions/*/*.so \
        | awk '$2 == "=>" && $3 ~ /^\// {print $3} $1 ~ /^\// && $2 ~ /^\(/ {print $1}' | sort -u); do \
        cp -L --parents "$(readlink -f "$(dirname "$library")")/$(basename "$library")" /runtime; \
    done; \
    for directory in /usr/lib/*/gconv; do \
        cp -a --parents "$directory" /runtime; \
    done; \
    chown -R 65532:65532 /runtime/var/www

COPY php-fpm.conf /runtime/usr/local/etc/php-fpm.conf
COPY rainloop.ini /runtime/usr/local/etc/php/php.ini

FROM gcr.io/distroless/base-debian13:nonroot AS runtime
COPY --from=build /runtime/ /
WORKDIR /var/www
USER 65532:65532
EXPOSE 9000
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/local/sbin/php-fpm"]
CMD ["--nodaemonize", "--fpm-config", "/usr/local/etc/php-fpm.conf"]
