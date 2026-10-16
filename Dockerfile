# Block Jump - the whole game as a static site in a container.
# Build context is this folder:  docker build -t <you>/block-jump:1.0 .
#
# There is no build step and nothing to install: the game is plain HTML, CSS
# and JavaScript, and both the pixel art and the sound are generated in the
# browser at runtime. So this image is just nginx plus ~130 KB of files.

FROM nginx:1.27-alpine

# Serve the game from the default web root. Explicit paths keep the tests and
# the screenshots out of the image even if .dockerignore is ignored.
COPY index.html /usr/share/nginx/html/index.html
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
# icons + web manifest, so the deployed URL gets a proper tab icon and can be
# added to a phone's home screen and launched full screen
COPY favicon.png icon-192.png icon-512.png apple-touch-icon.png manifest.json /usr/share/nginx/html/

# Our own server block replaces the stock one. `nginx -t` runs at build time,
# so a broken config fails the build instead of the deployment.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
RUN nginx -t

# Sealos (App Launchpad) expects the container port; nginx listens on 80.
EXPOSE 80
