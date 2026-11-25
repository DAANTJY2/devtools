FROM nginx:alpine

COPY site/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/headers.inc /etc/nginx/conf.d/headers.inc
