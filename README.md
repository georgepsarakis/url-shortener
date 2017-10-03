# url-shortener

Simple URL shortener service written with Express.js &amp; Redis.


The service also collects `User-Agent` statistics (number of visits) for each shortened URL.

## Endpoints

### `POST /api/v1/urls`

Shorten URL:


#### Request
```
Content-Type: application/json

{
    "url": "https://..."
}
```

#### Response
```
{
    "token": "abcdef",
    "status": "SUCCESS",
    "url": "https://..."
}
```

### `GET /api/v1/urls`

Retrieve the list of URL tokens:

#### Response
```
{
    "status": "SUCCESS",
    "url": ["abcdef", ...]
}
```

### `GET /:token`

Redirect to the URL where the given token is mapping.
