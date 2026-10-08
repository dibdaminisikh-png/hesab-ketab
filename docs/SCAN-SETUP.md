# فعال‌سازی اسکن فاکتور با Cloudflare Free

سایت و PWA روی GitHub Pages باقی می‌مانند. فقط عکس انتخاب‌شده برای اسکن به Worker می‌رود؛ نام میرزا، سفره‌دار، افراد و حساب جاری ارسال نمی‌شود. عکس در localStorage یا دیتابیس ذخیره نمی‌شود. اتصال مدل از AI binding است؛ سرویس خارجی یا خرید اعتبار لازم نیست. روی پلن Workers **Free** بمانید و AI Gateway Unified Billing یا مدل پولی را فعال نکنید.

## ۱. ایجاد Turnstile

در حساب Cloudflare، وارد Turnstile شوید و یک widget از نوع **Managed** بسازید. hostname را `dibdaminisikh-png.github.io` قرار دهید؛ مسیر `/hesab-ketab/` بخشی از hostname نیست. Site Key عمومی و Secret Key محرمانه را دریافت کنید.

Secret Key را در مخزن، فایل عمومی، متغیر VITE یا پیام چت قرار ندهید. برای این برنامه توکن در Worker با hostname و action برابر `receipt-scan` اعتبارسنجی می‌شود. Rate limit نیز ۶ درخواست در دقیقه برای هر IP است؛ این محدودیت کمکی است و سقف سراسری مصرف نیست. چند کاربر روی اینترنت موبایل ممکن است IP مشترک داشته باشند.

## ۲. ساخت Worker در حساب خودتان

در پوشهٔ مخزن، با Node.js 22.12 یا جدیدتر:

```sh
npm ci
npx wrangler login
```

در `worker/wrangler.jsonc` مقدار `TURNSTILE_SITE_KEY` را با Site Key عمومی widget جایگزین کنید. `ALLOWED_ORIGIN` باید `https://dibdaminisikh-png.github.io` بماند. namespace شناسهٔ rate limit در همین فایل تعریف می‌شود و دیتابیس نیاز ندارد؛ اگر همین namespace را در Worker دیگری استفاده کرده‌اید، یک عدد یکتا انتخاب کنید.

```sh
npm run worker:check
npm run worker:deploy
npx wrangler secret put TURNSTILE_SECRET_KEY --config worker/wrangler.jsonc
```

فرمان آخر Secret Key را به‌صورت تعاملی دریافت و در حساب کلودفلر ذخیره می‌کند. Worker تا زمانی که secret و site key و bindingهای AI و rate limit آماده نباشند، اسکن را با پاسخ کنترل‌شدهٔ 503 غیرفعال نگه می‌دارد.

نشانی خروجی مانند `https://hesab-ketab-scan.YOUR-SUBDOMAIN.workers.dev` است. خرید دامنه لازم نیست. راه دیگر، Deploy همین فایل با dashboard و اضافه‌کردن bindingهای معادل است؛ فایل wrangler راه تکرارپذیر و توصیه‌شده است.

### تنظیم از داشبورد

در Worker → Settings → Bindings، اتصال **Workers AI** را با نام `AI` اضافه کنید. اتصال **Rate limiter** با نام `SCAN_RATE_LIMITER`، Namespace ID برابر `10720261008`، Limit برابر `6` و Period برابر `60 seconds` لازم است.

در Runtime variables and secrets، متغیر Text به نام `ALLOWED_ORIGIN` با مقدار `https://dibdaminisikh-png.github.io` و متغیر Text به نام `TURNSTILE_SITE_KEY` با Site Key عمومی widget بسازید. `TURNSTILE_SECRET_KEY` باید از نوع **Secret** باشد. همهٔ این تنظیمات برای Production هستند.

اگر داشبورد هنگام افزودن binding خطای `No access` یا `Failed to add binding` داد، اتصال کامل نشده است؛ اسکن را فعال اعلام نکنید. دسترسی حساب و وضعیت سرویس را از خود داشبورد بررسی کنید. مخفی‌کردن خطا یا حذف بررسی binding در کد، جایگزین فعال‌سازی نیست.

## ۳. اتصال GitHub Pages

در GitHub → مخزن → Settings → Secrets and variables → Actions → **Variables** یک Repository variable با نام `VITE_SCAN_API_URL` بسازید و مقدارش را نشانی Worker قرار دهید؛ بدون `/scan` و بدون کلید محرمانه.

سپس در Actions گردش‌کار `Test and publish حساب کتاب` را Run workflow کنید. این variable فقط هنگام build خوانده می‌شود. تا وقتی تنظیم نشده، برنامه همچنان ورود دستی دارد و پنجرهٔ اسکن اعلام می‌کند اسکن فعال نشده است.

برای توسعه می‌توان همین نشانی را در `.env.local` نوشت؛ این فایل نباید commit شود. چون Worker مبدأ را کنترل می‌کند، برای آزمون localhost باید یک **Worker جداگانهٔ آزمایشی** با origin محلی و widget مجاز همان hostname ساخته شود؛ تنظیم تولید را برای تست ضعیف نکنید.

## ۴. رفتار اسکن

- هر عکس یک درخواست مدل `@cf/google/gemma-4-26b-a4b-it` است؛ reasoning غیرفعال و حداکثر خروجی ۲۵۰۰ توکن است. retry خودکار انجام نمی‌شود.
- یک ردیف سفارش چندتایی، یک آیتم با **مبلغ کل ردیف** می‌شود؛ تعداد در مبلغ استخراج‌شده دوباره ضرب نمی‌شود.
- واحدی که روی عکس نوشته نشده `unknown` می‌ماند؛ کاربر باید ریال یا تومان انتخاب کند. ریال بر ۱۰ تقسیم می‌شود و تبدیل غیرصحیح نیازمند اصلاح است.
- نام، مبلغ کل و انتخاب/عدم انتخاب ردیف‌ها پیش از افزودن قابل ویرایش‌اند. تأیید کاربر الزامی است؛ لغو هیچ آیتمی را تغییر نمی‌دهد.
- مالیات و هزینهٔ خدمات در پیش‌نمایش، ردیف هزینهٔ جانبی هستند. تخفیف برای بازبینی اعلام می‌شود و در نسخهٔ اول خودکار توزیع نمی‌شود.
- آیتم‌های دستی و نام فعلی فاکتور حفظ می‌شوند؛ فقط ردیف کاملاً خالی اولیه حذف می‌شود. شریک‌ها مطابق انتخاب فعلی فاکتور هستند. حساب‌های قدیمی با انتخاب متفاوت شریک‌ها نیز حفظ می‌شوند.
- عکس JPG/PNG/WebP تا ۱۰ MiB پذیرفته می‌شود؛ طول بزرگ‌تر تصویر در مرورگر به حداکثر ۲۴۰۰px و حجم خروجی به حداکثر ۱٫۵ MB کاهش می‌یابد. HEIC و PDF پشتیبانی نمی‌شوند.
- manifest، آیکون‌ها و راهنمای نصب PWA حفظ شده‌اند. اسکن اینترنت لازم دارد؛ offline caching جدید اضافه نشده است.

## ۵. صحت و سهمیه

پیش از اعلام فعال‌بودن قابلیت، روی نسخهٔ واقعی سایت یک عکس چاپی فارسی و یک عکس انگلیسی را اسکن کنید. نام‌ها، مبلغ کل ردیف چندتایی، مالیات، ریال/تومان و جمع نهایی را با عکس تطبیق دهید. عکس واقعی کاربر را در مخزن یا fixture عمومی نگذارید.

پاسخ `/scan` اگر مدل usage بدهد، `inputTokens`، `outputTokens` و `estimatedNeurons` دارد. برآورد Neuron از تعرفهٔ Gemma در ۸ اکتبر ۲۰۲۶ است: `inputTokens × 9091 / 1e6 + outputTokens × 27273 / 1e6`. مصرف واقعی صورتحساب را در Cloudflare → Workers AI مشاهده کنید. سهمیهٔ ۱۰٬۰۰۰ Neuron برای کل حساب و روزانه است؛ تست‌های توسعهٔ AI هم مصرف دارند. قطع درخواست در مرورگر تضمین نمی‌کند پردازش سرور و مصرف آن قطع شود.

Rate limit سراسری/روزانه نیست. Workers Free هنگام اتمام سهمیه درخواست‌ها را رد می‌کند؛ کاربران می‌توانند دستی وارد کنند. تعداد اسکن رایگان را فقط بعد از اندازه‌گیری واقعی اعلام کنید. اکنون تست‌های خودکار از پاسخ‌های ساختگی استفاده می‌کنند و کیفیت مدل روی عکس واقعی را اثبات نمی‌کنند.

## منابع رسمی

- [Workers AI binding](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/)
- [Gemma model](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)
- [قیمت و سهمیه](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [تأیید Turnstile در سرور](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
