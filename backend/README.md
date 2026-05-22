# 破壳派酒吧小程序后端

这是小程序配套后端服务，使用 Node.js 原生 HTTP 实现。生产环境使用 MySQL 持久化；开发环境也可以临时切回 `backend/data.json` 文件模式。

## 启动

```bash
cd backend
npm install
node server.js
```

默认端口为 `3001`。

## MySQL 存储

`.env` 中设置 `STORAGE_DRIVER=mysql` 后，业务数据会写入 MySQL 表 `app_collections`。当前实现保持原接口结构不变，将门店、分类、商品、活动、会员、订单、充值、存酒、通用设置等集合分别保存到 MySQL。

```bash
STORAGE_DRIVER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=pokerclub
MYSQL_PASSWORD=你的数据库密码
MYSQL_DATABASE=pokerclub
```

临时切回文件模式：

```bash
STORAGE_DRIVER=file
```

## 微信支付

后端已接入微信支付 API v3 JSAPI 支付。小程序端调用：

- `POST /api/wechat/pay/order` 创建订单支付
- `POST /api/wechat/pay/recharge` 创建充值支付
- `POST /api/wechat/pay/notify` 微信支付结果通知

生产环境需要在 `.env` 中配置：

```bash
WX_PAY_ENABLED=true
WX_PAY_APPID=小程序 AppID
WX_PAY_MCH_ID=微信支付商户号
WX_PAY_SERIAL_NO=商户 API 证书序列号
WX_PAY_API_V3_KEY=API v3 密钥
WX_PAY_PRIVATE_KEY_PATH=/opt/pokerclub/certs/apiclient_key.pem
WX_PAY_NOTIFY_URL=https://www.pokerpai.cn/api/wechat/pay/notify
WX_PAY_PLATFORM_CERT_PATH=/opt/pokerclub/certs/wechatpay_platform.pem
WX_PAY_REQUIRE_NOTIFY_VERIFY=true
```

正式上线请把通知地址改为备案后的 HTTPS 域名。

## 主要接口

- `POST /api/wechat/login` 微信 code 登录，返回 `openid/token/member`
- `POST /api/merchant/login` 商家登录，返回商家 token
- `GET /api/stores` 门店列表
- `GET /api/categories` 商品分类
- `GET /api/products` 商品列表
- `GET /api/activities` 活动列表
- `POST /api/orders` 创建订单，需要用户 token
- `POST /api/recharge` 用户储值，需要用户 token
- `POST /api/signups` 活动报名，需要用户 token
- `POST /api/cellar` 提交存酒，需要用户 token
- `GET /api/merchant/data/overview` 数据总览，需要商家 token
- `GET /api/merchant/data/export` 导出统计，需要商家 token
- `GET/POST /api/merchant/products` 商品管理，需要商家 token
- `GET/POST /api/merchant/categories` 分类管理，需要商家 token
- `GET/POST /api/merchant/activities` 活动管理，需要商家 token
- `GET/POST /api/merchant/stores` 门店管理，需要商家 token
- `GET /api/merchant/inventory` 库存列表，需要商家 token
- `PATCH /api/merchant/inventory/:id/stock` 调整库存，需要商家 token
- `GET/POST /api/merchant/recharge-settings` 充值优惠设置，需要商家 token
- `POST /api/merchant/members/:id/balance` 手动调整余额，需要商家 token
- `POST /api/merchant/members/:id/points` 手动调整积分，需要商家 token
