# 域名 + HTTPS 上线清单

目标：把 `http://47.94.222.72/music/` 换成 `https://<域名>/music/`。HTTPS 不只是好看：浏览器的 Service Worker 只在安全上下文可用，换域名后站点的离线缓存才会真正生效。

## 1. 买域名与解析

1. 买一个短域名（`.com` / `.cn` / `.me` 都行），解析 `A` 记录到 `47.94.222.72`。
2. 阿里云安全组放行 `80` 和 `443`。
3. 等 `ping <域名>` 能解析到服务器再继续。

## 2. 申请证书

服务器上（Ubuntu / Debian）：

```bash
apt-get update && apt-get install -y certbot
mkdir -p /var/www/certbot

certbot certonly --webroot -w /var/www/certbot \
  -d <域名> \
  --agree-tos -m <邮箱> --no-eff-email
```

证书在 `/etc/letsencrypt/live/<域名>/`。

## 3. 配置 nginx

```bash
cp deploy/nginx-music-https.conf.example /etc/nginx/conf.d/electronic-music.conf
# 把里面的 em.example.com 全部替换成你的域名
sed -i 's/em\.example\.com/<域名>/g' /etc/nginx/conf.d/electronic-music.conf

nginx -t && systemctl reload nginx
```

要点：

- 只新增独立 `server` 块，不动 `drink-ai.conf` 里 `/cet4/`、`/french/`、`/api/` 等现有服务。
- `sw.js` 必须放在 `/music/` 根目录并设置 `no-cache`，否则老访客会一直吃旧缓存。
- 站点文件仍在 `/var/www/electronic-music/serve/`，部署方式不变。

## 4. 重建分享壳页

分享壳页里的 `og:image` 是绝对地址，必须用新域名重新生成再上传：

```bash
node scripts/build-share.mjs --origin https://<域名> --path /music/ --images
scp -r dist-share/g dist-share/s dist-share/og root@47.94.222.72:/var/www/electronic-music/serve/
```

## 5. 验收

```bash
node scripts/regression/check-https.mjs https://<域名>/music/
node scripts/regression/live-check.mjs
node scripts/regression/live-mobile.mjs
```

`check-https.mjs` 会检查：首页、HTTP→HTTPS 跳转、`sw.js` 的 MIME 与缓存头、`kb.js` 是否压缩。全 PASS 再对外发链接。

## 6. 续期

```bash
certbot renew --dry-run
systemctl list-timers | grep certbot
```

Let's Encrypt 证书 90 天有效，certbot 默认会装好自动续期定时器。

## 回滚

```bash
rm /etc/nginx/conf.d/electronic-music.conf
nginx -t && systemctl reload nginx
```

原 IP 部署不受影响；DNS 把域名指回旧地址即可。
