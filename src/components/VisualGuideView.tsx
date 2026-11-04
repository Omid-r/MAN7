import React, { useState } from 'react';
import {
  BookOpen,
  Terminal,
  ShieldCheck,
  Layers,
  Cpu,
  HardDrive,
  FileCheck2,
  CheckCircle2,
  ArrowLeft,
  HelpCircle,
  PlugZap,
} from 'lucide-react';

interface VisualGuideViewProps {
  onNavigateModule: (
    mod:
      | 'visual_guide'
      | 'linux_terminal'
      | 'upgrade_path'
      | 'airgap_bundle'
      | 'rhel_hardening'
      | 'config_sanitizer'
  ) => void;
}

interface StepVisualCard {
  stepNum: string;
  badgeFA: string;
  titleFA: string;
  simpleAnalogyFA: string;
  whatYouDoFA: string[];
  screenshotUrl: string;
  targetModule:
    | 'linux_terminal'
    | 'upgrade_path'
    | 'airgap_bundle'
    | 'rhel_hardening'
    | 'config_sanitizer';
  targetButtonLabel: string;
}

interface TechGlossaryItem {
  id: string;
  term: string;
  titleFA: string;
  simpleMeaningFA: string;
  whyWeUseItFA: string;
  whatHappensWithoutItFA: string;
}

interface CommandAnatomyItem {
  id: string;
  titleFA: string;
  whereItRunsFA: string;
  fullCommand: string;
  purposeSimpleFA: string;
  parts: Array<{
    token: string;
    meaningFA: string;
  }>;
}

const VISUAL_STEPS: StepVisualCard[] = [
  {
    stepNum: 'گام اول',
    badgeFA: 'مرحله ۱ از ۴ · محاسبه نیازها',
    titleFA: 'محاسبه‌گر هوشمند مسیر ارتقاء و پیش‌نیازهای لینوکس (Upgrade Path)',
    simpleAnalogyFA:
      'قبل از هر کاری باید بدانیم دقیقاً چه فایل‌هایی لازم داریم! ارتقاء اسپلانک مثل رد شدن از یک رودخانه عریض است؛ نمی‌توانید یک‌باره از نسخه 7 یا 8.1 به نسخه 9.3 بپرید چون دیتابیس خراب می‌شود. در گام اول، نسخه فعلی و نسخه مقصد را انتخاب می‌کنید تا برنامه «ایستگاه‌های میانی» و ۱۴ پیش‌نیاز لینوکس را برایتان محاسبه کند.',
    whatYouDoFA: [
      'نسخه فعلی اسپلانک سرور قدیمی و نسخه جدیدی که می‌خواهید نصب کنید را انتخاب نمایید.',
      'نسخه سیستم‌عامل لینوکس سرور جدید (مثلاً RHEL 9.4) و نقش سرور را مشخص کنید.',
      'مسیر ارتقاء پله‌به‌پله و لیست ۱۴ پکیج پیش‌نیاز لینوکس را بررسی کرده و وارد گام دوم شوید.',
    ],
    screenshotUrl: '/media/man7-step2-upgrade.png',
    targetModule: 'upgrade_path',
    targetButtonLabel: 'ورود به گام ۱: محاسبه‌گر مسیر ارتقاء',
  },
  {
    stepNum: 'گام دوم',
    badgeFA: 'مرحله ۲ از ۴ · تنظیمات امنیتی لینوکس',
    titleFA: 'ایمن‌سازی و تنظیم استاندارد هسته لینوکس (RHEL OS Hardening)',
    simpleAnalogyFA:
      'پس از مشخص شدن مسیر ارتقاء، قبل از ساختن اسکریپت‌های نصب باید «قفل درها» و «ظرفیت موتور» لینوکس جدید را تنظیم کنیم؛ یعنی قابلیت مزاحم THP را خاموش کنیم و سقف فایل‌های باز لینوکس را روی 65536 بگذاریم تا این اعداد به صورت خودکار وارد اسکریپت نصب گام ۳ شوند.',
    whatYouDoFA: [
      'مطمئن شوید تیک «غیرفعال‌سازی Transparent Huge Pages (THP)» فعال است (افزایش ۳۰٪ سرعت اسپلانک).',
      'سقف فایل‌های باز (NOFILE=65536) و پورت‌های مجاز فایروال را تایید کنید تا در اسکریپت گام ۳ اعمال شوند.',
    ],
    screenshotUrl: '/media/man7-step4-hardening.png',
    targetModule: 'rhel_hardening',
    targetButtonLabel: 'ورود به گام ۲: ایمن‌سازی کرنل RHEL',
  },
  {
    stepNum: 'گام سوم',
    badgeFA: 'مرحله ۳ از ۴ · ساخت باندل و آپلود مستقیم روی سرور',
    titleFA: 'اسکریپت‌های دو مرحله‌ای (گام A و B) و آپلود مستقیم به مسیر نصب سرور',
    simpleAnalogyFA:
      'حالا که در گام ۱ و ۲ همه‌چیز محاسبه شد، برنامه اسکریپت ماشین آنلاین (گام A) و سرور آفلاین (گام B) را به شما می‌دهد. پس از اینکه فایل‌های آفلاین روی سیستم شما دانلود شد، از بخش «آپلود مستقیم روی سرور» در همین صفحه، فایل‌ها را مستقیماً به پوشه نصب سرور (/var/tmp و /opt/splunk-airgap) می‌فرستید تا برنامه نصب و تست را انجام دهد.',
    whatYouDoFA: [
      'اسکریپت گام A را روی سیستم دارای اینترنت اجرا کنید تا باندل کامل آفلاین (.tar.gz) ساخته شود.',
      'فایل دانلودشده را از کادر «آپلود مستقیم نسخه آفلاین روی سرور مقصد» مستقیماً به مسیر /var/tmp یا /opt/splunk-airgap سرور بفرستید.',
      'روی دکمه «تست سلامت فایل‌های آپلودشده و اجرای اسکریپت گام B روی سرور» کلیک کنید.',
    ],
    screenshotUrl: '/media/man7-step3-airgap.png',
    targetModule: 'airgap_bundle',
    targetButtonLabel: 'ورود به گام ۳: اسکریپت‌ها و آپلود به سرور',
  },
  {
    stepNum: 'گام چهارم',
    badgeFA: 'مرحله ۴ از ۴ · پالایش کانفیگ و تست نهایی',
    titleFA: 'پالایشگر هوشمند فایل‌های کانفیگ قدیمی (.conf Sanitizer) و چک‌لیست تست',
    simpleAnalogyFA:
      'فایل‌های تنظیمات اسپلانک قدیمی حاوی دستوراتی هستند که در نسخه ۹ دیگر کار نمی‌کنند (مثل Python 2 یا موتور قدیمی MMAPv1). این بخش مثل یک ویراستار هوشمند تمام خطاها را پیدا کرده و با یک کلیک آن‌ها را به فرمت استاندارد Splunk 9.x تبدیل می‌کند.',
    whatYouDoFA: [
      'فایل .conf سرور قدیم را بارگذاری کنید تا خطاهای ناسازگار با رنگ قرمز مشخص شوند.',
      'روی دکمه «اعمال خودکار اصلاحات استاندارد Splunk 9.x» کلیک کنید و آن را مستقیم در مسیر سرور ذخیره نمایید.',
      'چک‌لیست ۴ فازه تایید سلامت نهایی را تیک بزنید.',
    ],
    screenshotUrl: '/media/man7-step5-sanitizer.png',
    targetModule: 'config_sanitizer',
    targetButtonLabel: 'ورود به گام ۴: پالایش کانفیگ و چک‌لیست',
  },
  {
    stepNum: 'بخش مجزا (کنسول سرور)',
    badgeFA: 'ابزار مستقل مدیریت سرور · اتصال با یک پورت و یک دستور Root',
    titleFA: 'اتصال به سرور از طریق پورت Root، ترمینال زنده لینوکس و آپلود مستقیم',
    simpleAnalogyFA:
      'برای اینکه نرم‌افزار بتواند وارد سرور مقصد شود و تمام کارهای نصب و تست را با دسترسی کامل (Root) انجام دهد، یک بخش مجزا در بالای برنامه قرار دارد. کاربر فقط یک پورت روی سرورش باز می‌کند و یک دستور تک‌خطی می‌زند که به هر کسی که از طریق این پورت وصل شود دسترسی Root می‌دهد.',
    whatYouDoFA: [
      'تک‌دستور آماده‌شده در کادر سمت چپ را کپی کرده و یک‌بار روی سرور لینوکس خود اجرا کنید تا پورت (مثلاً 9099) با دسترسی Root باز شود.',
      'آی‌پی سرور و شماره پورت را وارد کرده و دکمه «اتصال به پورت و دریافت دسترسی Root» را بزنید.',
      'هر دستور لینوکسی را مستقیماً در ترمینال داخل UI اجرا کنید و خروجی لحظه‌ای سرور را ببینید.',
    ],
    screenshotUrl: '/media/man7-step1-terminal.png',
    targetModule: 'linux_terminal',
    targetButtonLabel: 'باز کردن بخش مجزای پورت Root و ترمینال سرور',
  },
];

const TECH_GLOSSARY: TechGlossaryItem[] = [
  {
    id: 'root-port',
    term: 'One-Port Root Bridge (پورت مستقیم دسترسی Root)',
    titleFA: 'اتصال به سرور با یک پورت و یک دستور تک‌خطی یعنی چه؟',
    simpleMeaningFA:
      'یک کانال ارتباطی مستقیم روی پورت دلخواه شما (مثلاً پورت 9099) که شل /bin/bash سرور لینوکس را با سطح دسترسی مدیر کل (root) در اختیار رابط کاربری MAN7 قرار می‌دهد.',
    whyWeUseItFA:
      'کاربر بدون درگیر شدن با تنظیمات پیچیده SSH Key یا Ansible، فقط یک پورت روی سرور باز می‌کند و یک دستور می‌زند تا نرم‌افزار MAN7 بتواند فایل‌های آفلاین را در مسیر نصب کپی کرده و اسکریپت‌ها را اجرا و تست کند.',
    whatHappensWithoutItFA:
      'بدون این پورت ارتباطی، مجبور هستید تمام فایل‌ها و دستورات را به صورت دستی با برنامه‌های جانبی منتقل و تایپ کنید.',
  },
  {
    id: 'air-gap',
    term: 'Air-Gapped Environment (محیط ایزوله بدون اینترنت)',
    titleFA: 'شبکه ایزوله یا Air-Gap چیست؟',
    simpleMeaningFA:
      'سروری که هیچ‌گونه ارتباطی با اینترنت جهانی ندارد و حتی کابل شبکه آن به اینترنت وصل نیست.',
    whyWeUseItFA:
      'در بانک‌ها، مراکز مخابراتی و سازمان‌های حساس، سرورهای لاگ و امنیت (Splunk) برای جلوگیری از هک شدن کاملاً از اینترنت قطع هستند.',
    whatHappensWithoutItFA:
      'اگر بخواهید روی این سرورها دستور دانلود معمولی (`yum install` یا `wget`) بزنید، با خطای Network Unreachable مواجه می‌شوید. به همین دلیل MAN7 از روش دو مرحله‌ای (گام A آنلاین و گام B آفلاین) استفاده می‌کند.',
  },
  {
    id: 'rhel',
    term: 'RHEL (Red Hat Enterprise Linux)',
    titleFA: 'سیستم‌عامل لینوکس RHEL چیست؟',
    simpleMeaningFA:
      'نسخه سازمانی، فوق‌العاده پایدار و امن سیستم‌عامل لینوکس که توسط شرکت Red Hat برای سرورهای حساس ساخته شده است.',
    whyWeUseItFA:
      'اسپلانک برای پردازش میلیون‌ها رویداد در ثانیه نیاز به سیستم‌عاملی دارد که ماه‌ها و سال‌ها بدون ری‌استارت شدن و بدون کرش کردن کار کند.',
    whatHappensWithoutItFA:
      'نسخه‌های قدیمی لینوکس (مثل RHEL 7) دیگر از کتابخانه‌های مدرن C (`glibc 2.28+`) که اسپلانک 9.4 به آن نیاز دارد پشتیبانی نمی‌کنند.',
  },
  {
    id: 'rpm-deps',
    term: 'RPM Packages & Transitive Dependencies',
    titleFA: 'پکیج‌های پیش‌نیاز RPM (مثل glibc و libxcrypt-compat) چیستند؟',
    simpleMeaningFA:
      'قطعات یدکی و کتابخانه‌های پایه لینوکس که برنامه‌های بزرگ برای اجرا شدن به آن‌ها تکیه می‌کنند.',
    whyWeUseItFA:
      'اسپلانک برای رمزنگاری، مدیریت زمان و اجرای سیاست‌های امنیتی به ۱۴ پکیج پایه لینوکس نیاز دارد که باید در گام A دانلود و در گام B نصب شوند.',
    whatHappensWithoutItFA:
      'مثلاً اگر در لینوکس RHEL 9 پکیج `libxcrypt-compat` نصب نباشد، سرویس اسپلانک اصلاً روشن نمی‌شود.',
  },
  {
    id: 'kvstore-wiredtiger',
    term: 'KV Store & WiredTiger Engine (MongoDB 7.0 + AVX)',
    titleFA: 'موتور KV Store و WiredTiger و قابلیت AVX چیست؟',
    simpleMeaningFA:
      'KV Store دیتابیس داخلی اسپلانک است که اطلاعات داشبوردها و اپلیکیشن‌ها را نگه می‌دارد. WiredTiger موتور جدید و پرسرعت این دیتابیس است.',
    whyWeUseItFA:
      'در اسپلانک ۹، موتور قدیمی (`MMAPv1`) حذف شده و دیتابیس داخلی به MongoDB 7.0 ارتقاء یافته که نیازمند پشتیبانی پردازنده (CPU) از دستورالعمل سخت‌افزاری **AVX** است.',
    whatHappensWithoutItFA:
      'اگر قبل از رفتن به نسخه ۹ موتور دیتابیس را به WiredTiger تبدیل نکنید یا CPU سرور قابلیت AVX نداشته باشد، سرویس KV Store از کار می‌افتد.',
  },
  {
    id: 'thp',
    term: 'Transparent Huge Pages (THP = never)',
    titleFA: 'قابلیت Transparent Huge Pages (THP) در کرنل لینوکس چیست؟',
    simpleMeaningFA:
      'یک ویژگی پیش‌فرض در لینوکس که قطعات کوچک حافظه رم (RAM) را به قطعات بزرگ ۲ مگابایتی می‌چسباند.',
    whyWeUseItFA:
      'برخلاف دیتابیس‌های معمولی، اسپلانک به حافظه رم به صورت ریز و پراکنده دسترسی دارد. इसलिए باید THP را در لینوکس **خاموش (`never`)** کنیم.',
    whatHappensWithoutItFA:
      'روشن ماندن THP باعث می‌شود سرعت جستجو و ایندکس کردن اسپلانک ۳۰ تا ۴۰ درصد کندتر شود و پردازنده سرور درگیر وقفه‌های کرنل گردد.',
  },
  {
    id: 'splunk-secret',
    term: 'splunk.secret & Encrypted Passwords',
    titleFA: 'فایل شاه‌کلید امنیتی (`splunk.secret`) چیست؟',
    simpleMeaningFA:
      'یک فایل کوچک اما حیاتی در پوشه `/opt/splunk/etc/auth/splunk.secret` که مثل «شاه‌کلید گاوصندوق» عمل می‌کند.',
    whyWeUseItFA:
      'اسپلانک تمام رمزهای عبور (مثل رمز اکتیودایرکتوری، دیتابیس‌ها و SSL) را با این کلید رمزنگاری می‌کند. در زمان مهاجرت باید حتماً این فایل را از سرور قدیم به سرور جدید منتقل کنیم.',
    whatHappensWithoutItFA:
      'اگر تنظیمات را به سرور جدید ببرید ولی فایل `splunk.secret` سرور قدیم را کپی نکنید، سرور جدید نمی‌تواند هیچ‌کدام از رمزهای عبور را رمزگشایی کند.',
  },
  {
    id: 'sha256',
    term: 'SHA-256 Checksum & File Staging',
    titleFA: 'کد سلامت و اثر انگشت دیجیتال (`SHA-256`) چیست؟',
    simpleMeaningFA:
      'یک رشته ۶۴ کاراکتری یکتا که از روی تک‌تک بایت‌های یک فایل محاسبه می‌شود.',
    whyWeUseItFA:
      'وقتی فایل‌های چند گیگابایتی اسپلانک را به سرور آفلاین منتقل و آپلود می‌کنید، MAN7 به صورت خودکار کد SHA-256 آن را حساب می‌کند تا مطمئن شود فایل در حین انتقال حتی ۱ بایت هم آسیب ندیده است.',
    whatHappensWithoutItFA:
      'فایل ناقص در میانه فرآیند ارتقاء باعث خراب شدن کل پوشه `/opt/splunk` می‌شود.',
  },
];

const COMMAND_ANATOMY_LIST: CommandAnatomyItem[] = [
  {
    id: 'cmd-root-port',
    titleFA: '۱. تک‌دستور باز کردن پورت و اعطای دسترسی Root روی سرور مقصد',
    whereItRunsFA: 'محل اجرا: یک‌بار روی سرور لینوکس مقصد با کاربر root',
    fullCommand:
      "firewall-cmd --add-port=9099/tcp --permanent; firewall-cmd --reload; nohup python3 -c \"import socket,os;s=socket.socket();s.bind(('0.0.0.0',9099));s.listen(5)...\" &",
    purposeSimpleFA:
      'این دستور پورت انتخابی شما (مثلاً 9099) را در فایروال لینوکس باز می‌کند و یک شنونده سبک در پس‌زمینه راه‌اندازی می‌کند که به محض اتصال برنامه MAN7 به این پورت، شل /bin/bash با دسترسی کامل root را در اختیارش قرار می‌دهد.',
    parts: [
      { token: 'firewall-cmd --add-port=9099/tcp --permanent', meaningFA: 'پورت 9099 را به صورت دائمی در فایروال لینوکس RHEL باز می‌کند.' },
      { token: 'nohup python3 -c "..." &', meaningFA: 'برنامه شنونده پورت را در پس‌زمینه (Background) اجرا می‌کند تا حتی اگر پنجره SSH را بستید، پورت باز بماند.' },
      { token: "s.bind(('0.0.0.0', 9099))", meaningFA: 'روی تمام کارت‌های شبکه سرور به پورت 9099 گوش می‌دهد.' },
      { token: "os.execv('/bin/bash', ['/bin/bash', '-s'])", meaningFA: 'هر دستوری که از طرف UI به این پورت ارسال شود را مستقیماً در شل /bin/bash با دسترسی root اجرا می‌کند.' },
    ],
  },
  {
    id: 'cmd-dnf',
    titleFA: '۲. دستور دانلود کامل پیش‌نیازهای لینوکس در ماشین آنلاین (گام A)',
    whereItRunsFA: 'محل اجرا: ماشین لینوکسی متصل به اینترنت (Step A)',
    fullCommand:
      'dnf download --resolve --alldeps --destdir=/tmp/man7-airgap-bundle/rpms glibc libxcrypt-compat policycoreutils-python-utils tuned rsync chrony',
    purposeSimpleFA:
      'این دستور به جای نصب کردن برنامه روی کامپیوتر آنلاین، فایل نصبی پکیج‌ها و تمام زیرمجموعه‌های وابسته به آن‌ها را دانلود کرده و داخل یک پوشه ذخیره می‌کند تا بتوانید به سرور آفلاین ببرید.',
    parts: [
      { token: 'dnf download', meaningFA: 'به مدیر بسته ردهت می‌گوید پکیج را نصب نکن، فقط فایل .rpm آن را دانلود کن.' },
      { token: '--resolve', meaningFA: 'بررسی می‌کند این پکیج برای کار کردن به چه پکیج‌های کمکی دیگری نیاز دارد.' },
      { token: '--alldeps', meaningFA: 'تمام وابستگی‌های سطح اول و دوم را به صورت کامل دانلود می‌کند تا در سرور آفلاین با خطای کمبود فایل مواجه نشوید.' },
      { token: '--destdir=...', meaningFA: 'مسیر پوشه‌ای که فایل‌های دانلودشده باید داخل آن ذخیره شوند را مشخص می‌کند.' },
      { token: 'glibc libxcrypt-compat ...', meaningFA: 'نام پکیج‌های حیاتی لینوکس که اسپلانک برای اجرا و ایمن‌سازی به آن‌ها نیاز دارد.' },
    ],
  },
  {
    id: 'cmd-btool',
    titleFA: '۳. دستور عیب‌یابی تنظیمات و بکاپ‌گیری از دیتابیس داخلی (سرور قدیمی)',
    whereItRunsFA: 'محل اجرا: سرور اسپلانک قدیمی پیش از خاموش کردن',
    fullCommand:
      '/opt/splunk/bin/splunk cmd btool check && /opt/splunk/bin/splunk backup kvstore -archiveName kvstore_migration_backup',
    purposeSimpleFA:
      'اول بررسی می‌کند که در فایل‌های تنظیمات سرور قدیم هیچ غلط املایی وجود نداشته باشد، و بلافاصله یک نسخه پشتیبان کامل از دیتابیس داخلی اسپلانک می‌گیرد.',
    parts: [
      { token: '/opt/splunk/bin/splunk', meaningFA: 'فراخوانی برنامه اصلی خط فرمان اسپلانک.' },
      { token: 'cmd btool check', meaningFA: 'اجرای ابزار عیب‌یاب داخلی اسپلانک برای بررسی صحت املایی تمام فایل‌های .conf.' },
      { token: '&&', meaningFA: 'یعنی اگر دستور اول بدون خطا انجام شد، برو سراغ دستور دوم.' },
      { token: 'backup kvstore -archiveName ...', meaningFA: 'گرفتن عکس فوری (Backup) از دیتابیس MongoDB داخلی اسپلانک بدون خراب شدن اطلاعات.' },
    ],
  },
  {
    id: 'cmd-rsync',
    titleFA: '۴. دستور کپی دقیق تنظیمات با حفظ مجوزها و برچسب‌های امنیتی',
    whereItRunsFA: 'محل اجرا: سرور اسپلانک قدیمی / سرور جدید',
    fullCommand:
      'rsync -aHAX /opt/splunk/etc/system/local /var/tmp/splunk-migration-export/etc/system_local',
    purposeSimpleFA:
      'فایل‌های تنظیمات را طوری کپی می‌کند که مالکیت فایل‌ها، تاریخ ساخت و برچسب‌های امنیتی لینوکس (SELinux) دقیقاً دست‌نخورده باقی بمانند.',
    parts: [
      { token: 'rsync', meaningFA: 'ابزار حرفه‌ای و سریع کپی و همگام‌سازی فایل در لینوکس.' },
      { token: '-a (Archive)', meaningFA: 'حفظ کامل ساختار پوشه‌ها، لینک‌ها، مالکیت کاربر (splunk:splunk) و زمان فایل‌ها.' },
      { token: '-H (Hard-links)', meaningFA: 'حفظ لینک‌های سخت بین فایل‌ها.' },
      { token: '-A (ACLs)', meaningFA: 'حفظ مجوزهای دسترسی پیشرفته لینوکس (Access Control Lists).' },
      { token: '-X (Xattrs)', meaningFA: 'حفظ برچسب‌های امنیتی SELinux روی فایل‌ها.' },
    ],
  },
  {
    id: 'cmd-rpm',
    titleFA: '۵. دستور نصب آفلاین پکیج‌های لینوکس در سرور بدون اینترنت (گام B)',
    whereItRunsFA: 'محل اجرا: سرور لینوکس RHEL جدید (کاملاً آفلاین)',
    fullCommand: 'rpm -Uvh --replacepkgs /opt/splunk-airgap/rpms/*.rpm',
    purposeSimpleFA:
      'تمام پکیج‌های پیش‌نیاز لینوکس را که در پوشه سرور آپلود کرده‌ایم، بدون نیاز به اینترنت و به صورت یک‌جا از روی هارد سرور نصب می‌کند.',
    parts: [
      { token: 'rpm', meaningFA: 'برنامه مدیریت پکیج سطح پایین Red Hat که هیچ نیازی به اینترنت ندارد.' },
      { token: '-U (Upgrade/Install)', meaningFA: 'اگر پکیج نصب نیست نصبش کن، و اگر نسخه قدیمی‌ترش نصب است آن را به نسخه جدید ارتقاء بده.' },
      { token: '-v (Verbose)', meaningFA: 'جزئیات کار را خط به خط روی صفحه نمایش بده.' },
      { token: '-h (Hash)', meaningFA: 'نوار پیشرفت نصب را با علامت # نمایش بده.' },
      { token: '--replacepkgs', meaningFA: 'اگر یکی از پکیج‌ها از قبل نصب بود، خطا نده و متوقف نشو؛ به کار ادامه بده.' },
    ],
  },
  {
    id: 'cmd-kvstore-migrate',
    titleFA: '۶. دستور ارتقاء موتور دیتابیس KV Store به WiredTiger',
    whereItRunsFA: 'محل اجرا: سرور جدید در ایستگاه میانی Splunk 8.2.12',
    fullCommand:
      '/opt/splunk/bin/splunk migrate kvstore-storage-engine --target-engine wiredTiger',
    purposeSimpleFA:
      'فرمت دیتابیس داخلی اسپلانک را از حالت قدیمی (MMAPv1) به حالت مدرن و پرسرعت (WiredTiger) تبدیل می‌کند تا اسپلانک ۹ بتواند روشن شود.',
    parts: [
      { token: 'migrate kvstore-storage-engine', meaningFA: 'دستور رسمی اسپلانک برای شروع فرآیند تبدیل ساختار دیتابیس داخلی.' },
      { token: '--target-engine wiredTiger', meaningFA: 'مشخص می‌کند که موتور مقصد باید WiredTiger (سازگار با MongoDB مدرن در نسخه ۹) باشد.' },
    ],
  },
  {
    id: 'cmd-splunk-hop',
    titleFA: '۷. دستور استخراج و ارتقاء خودکار و بدون توقف اسپلانک (در حلقه گام B)',
    whereItRunsFA: 'محل اجرا: سرور آفلاین جدید برای هر ایستگاه نسخه‌ای',
    fullCommand:
      'tar -xzf splunk-9.3.2-linux-x86_64.tgz -C /opt && /opt/splunk/bin/splunk start --accept-license --answer-yes --no-prompt',
    purposeSimpleFA:
      'فایل فشرده نسخه جدید اسپلانک را روی پوشه `/opt/splunk` باز می‌کند و بدون اینکه منتظر تایید دستی کاربر بماند، لایسنس را قبول کرده و دیتابیس را به نسخه جدید ارتقاء می‌دهد.',
    parts: [
      { token: 'tar -xzf ... -C /opt', meaningFA: 'فایل فشرده (.tgz) را باز کرده و محتویات آن را دقیقاً در مسیر `/opt/splunk` جایگزین فایل‌های برنامه قبلی می‌کند.' },
      { token: 'splunk start', meaningFA: 'روشن کردن سرویس اسپلانک برای انجام ارتقاء خودکار آن نسخه.' },
      { token: '--accept-license', meaningFA: 'قبول کردن خودکار متن توافق‌نامه لایسنس اسپلانک.' },
      { token: '--answer-yes --no-prompt', meaningFA: 'به تمام سؤالات «آیا مایل به ارتقاء هستید؟» به صورت خودکار پاسخ «بله» می‌دهد تا اسکریپت بدون توقف تا آخرین نسخه پیش برود.' },
    ],
  },
];

export const VisualGuideView: React.FC<VisualGuideViewProps> = ({ onNavigateModule }) => {
  const [activeSubTab, setActiveSubTab] = useState<'steps_visual' | 'glossary' | 'commands'>('steps_visual');

  return (
    <div className="space-y-8">
      {/* Header & Sub-Navigation */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-100">
              راهنمای جامع تصویری و گام‌به‌گام MAN7 (به زبان ساده برای همه کاربران)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              آموزش تصویری ۴ گام اصلی به ترتیب انجام کار + راهنمای بخش مجزای اتصال پورت Root، فرهنگ‌نامه ساده تکنولوژی‌ها و کالبدشکافی کلمه‌به‌کلمه دستورات.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setActiveSubTab('steps_visual')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeSubTab === 'steps_visual'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>۱. راهنمای تصویری مراحل به ترتیب اجرا</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('glossary')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeSubTab === 'glossary'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>۲. توضیح ساده تکنولوژی‌ها</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('commands')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeSubTab === 'commands'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>۳. کالبدشکافی کلمه‌به‌کلمه دستورات</span>
            </button>
          </div>
        </div>

        {/* Visual Architecture Diagram (Inline SVG — 100% Offline & Zero External Dependency) */}
        <div className="pt-6">
          <h3 className="text-sm font-bold text-slate-200 mb-3">
            نقشه کلی کارکرد سامانه در یک نگاه (به ترتیب از گام ۱ تا استقرار نهایی روی پورت Root سرور)
          </h3>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 overflow-x-auto">
            <svg
              viewBox="0 0 960 190"
              className="w-full min-w-[720px] h-auto"
              role="img"
              aria-label="نمودار معماری گام‌به‌گام در سامانه MAN7"
            >
              {/* Box 1: Step 1 & 2 Calculation */}
              <rect x="20" y="20" width="260" height="150" rx="12" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
              <text x="150" y="50" textAnchor="middle" fill="#34d399" fontSize="14" fontWeight="bold">
                گام ۱ و ۲: محاسبه مسیر و ایمن‌سازی
              </text>
              <text x="150" y="78" textAnchor="middle" fill="#cbd5e1" fontSize="11">
                تعیین ایستگاه‌های میانی اسپلانک + ۱۴ پکیج RPM
              </text>
              <text x="150" y="98" textAnchor="middle" fill="#cbd5e1" fontSize="11">
                + تنظیم THP=never و NOFILE=65536
              </text>
              <rect x="45" y="114" width="210" height="24" rx="6" fill="#020617" stroke="#1e293b" />
              <text x="150" y="130" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                8.1.14 → 8.2.12 → 9.0.9 → 9.3.2
              </text>
              <text x="150" y="156" textAnchor="middle" fill="#10b981" fontSize="10" fontWeight="bold">
                ورودی مستقیم برای ساخت اسکریپت‌های گام ۳
              </text>

              {/* Arrow 1 -> 2 */}
              <line x1="285" y1="95" x2="345" y2="95" stroke="#10b981" strokeWidth="2" strokeDasharray="5,5" />
              <polygon points="345,90 355,95 345,100" fill="#10b981" />
              <text x="318" y="82" textAnchor="middle" fill="#94a3b8" fontSize="10">
                تولید اسکریپت
              </text>

              {/* Box 2: Step 3 Bundle & Upload */}
              <rect x="358" y="20" width="244" height="150" rx="12" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
              <text x="480" y="50" textAnchor="middle" fill="#fbbf24" fontSize="14" fontWeight="bold">
                گام ۳: باندل آفلاین و آپلود به سرور
              </text>
              <text x="480" y="78" textAnchor="middle" fill="#cbd5e1" fontSize="11">
                دانلود باندل در ماشین آنلاین (گام A)
              </text>
              <text x="480" y="98" textAnchor="middle" fill="#cbd5e1" fontSize="11">
                + آپلود مستقیم به مسیر نصب سرور (/var/tmp)
              </text>
              <rect x="380" y="114" width="200" height="24" rx="6" fill="#020617" stroke="#1e293b" />
              <text x="480" y="130" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                /var/tmp &amp; /opt/splunk-airgap
              </text>
              <text x="480" y="156" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">
                ارسال مستقیم به محل نصب برنامه + تست
              </text>

              {/* Arrow 2 -> 3 */}
              <line x1="605" y1="95" x2="665" y2="95" stroke="#38bdf8" strokeWidth="2" strokeDasharray="5,5" />
              <polygon points="665,90 675,95 665,100" fill="#38bdf8" />
              <text x="638" y="82" textAnchor="middle" fill="#94a3b8" fontSize="10">
                پورت Root (9099)
              </text>

              {/* Box 3: Root Port Execution & Step 4 */}
              <rect x="678" y="20" width="262" height="150" rx="12" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
              <text x="809" y="50" textAnchor="middle" fill="#38bdf8" fontSize="14" fontWeight="bold">
                کنسول پورت Root و گام ۴ (نصب و تست)
              </text>
              <text x="809" y="78" textAnchor="middle" fill="#cbd5e1" fontSize="11">
                ۱. باز کردن یک پورت روی سرور با تک‌دستور Root
              </text>
              <text x="809" y="98" textAnchor="middle" fill="#cbd5e1" fontSize="11">
                ۲. اجرای خودکار نصب آفلاین و تست سلامت
              </text>
              <rect x="704" y="114" width="210" height="24" rx="6" fill="#020617" stroke="#1e293b" />
              <text x="809" y="130" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                step_b_offline_rhel_deployer.sh
              </text>
              <text x="809" y="156" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="bold">
                اجرای ۱۰۰٪ آفلاین با دسترسی Root روی سرور
              </text>
            </svg>
          </div>
        </div>
      </section>

      {/* TAB 1: Step-by-Step Illustrated Cards (No Video) */}
      {activeSubTab === 'steps_visual' && (
        <div className="space-y-6">
          {VISUAL_STEPS.map((step) => (
            <section
              key={step.stepNum}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
            >
              <div className="lg:col-span-6 space-y-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400">
                  <span>{step.stepNum}</span>
                  <span>·</span>
                  <span>{step.badgeFA}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-100 leading-snug">
                  {step.titleFA}
                </h3>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5 mb-1.5">
                    <HelpCircle className="w-4 h-4 shrink-0" />
                    <span>به زبان خیلی ساده یعنی چه؟</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {step.simpleAnalogyFA}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-200">
                    در این بخش چه کارهایی باید انجام دهید؟
                  </div>
                  <ul className="space-y-1.5">
                    {step.whatYouDoFA.map((item, idx) => (
                      <li key={idx} className="text-xs text-slate-300 flex items-start gap-2 leading-relaxed">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigateModule(step.targetModule)}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>{step.targetButtonLabel}</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-2">
                  <img
                    src={step.screenshotUrl}
                    alt={step.titleFA}
                    className="w-full h-auto rounded-lg object-cover border border-slate-800/80"
                  />
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* TAB 2: Plain-Language Technology Glossary */}
      {activeSubTab === 'glossary' && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="pb-4 border-b border-slate-800">
            <h3 className="text-lg font-bold text-slate-100">
              فرهنگ‌نامه ساده تکنولوژی‌ها (هر تکنولوژی چیست و چرا از آن استفاده می‌کنیم؟)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              توضیح دقیق ولی به زبان کاملاً غیرفنی برای تمام اصطلاحاتی که در طول کار با نرم‌افزار مشاهده می‌کنید.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TECH_GLOSSARY.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="text-xs font-mono font-bold text-emerald-400" dir="ltr">
                    {item.term}
                  </div>
                  <h4 className="text-base font-bold text-slate-100">{item.titleFA}</h4>

                  <div className="space-y-2 pt-1">
                    <div className="text-xs text-slate-300 leading-relaxed">
                      <span className="font-bold text-sky-400">معنی ساده: </span>
                      {item.simpleMeaningFA}
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed">
                      <span className="font-bold text-emerald-400">چرا استفاده می‌کنیم؟ </span>
                      {item.whyWeUseItFA}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 text-xs text-amber-300/90 leading-relaxed">
                  <span className="font-bold">اگر نباشد چه می‌شود؟ </span>
                  {item.whatHappensWithoutItFA}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: Step-by-Step Command Anatomy */}
      {activeSubTab === 'commands' && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="pb-4 border-b border-slate-800">
            <h3 className="text-lg font-bold text-slate-100">
              کالبدشکافی کلمه‌به‌کلمه تمام دستورات لینوکس و اسپلانک
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              در این بخش، تک‌تک دستوراتی که سامانه MAN7 تولید یا در ترمینال اجرا می‌کند، کلمه به کلمه تشریح شده‌اند تا دقیقاً بدانید هر سوئیچ چه کاری انجام می‌دهد.
            </p>
          </div>

          <div className="space-y-6">
            {COMMAND_ANATOMY_LIST.map((cmd) => (
              <div
                key={cmd.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <h4 className="text-base font-bold text-slate-100">{cmd.titleFA}</h4>
                  <span className="text-xs font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-3 py-1 rounded-lg shrink-0">
                    {cmd.whereItRunsFA}
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 overflow-x-auto" dir="ltr">
                  <code className="text-xs font-mono text-emerald-300">{cmd.fullCommand}</code>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  <span className="font-bold text-amber-300">هدف کلی این دستور: </span>
                  {cmd.purposeSimpleFA}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {cmd.parts.map((part, pIdx) => (
                    <div
                      key={pIdx}
                      className="bg-slate-900/70 border border-slate-800/90 rounded-lg p-3 flex flex-col gap-1"
                    >
                      <span className="text-xs font-mono font-bold text-sky-400" dir="ltr">
                        {part.token}
                      </span>
                      <span className="text-xs text-slate-300 leading-relaxed">
                        {part.meaningFA}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
