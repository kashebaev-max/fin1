import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Finstat.kz",
  description: "Обработка персональных данных в Finstat.kz",
};

export default function PrivacyPage() {
  return (
    <article>
      <h1 className="text-2xl font-bold mb-2">Политика конфиденциальности</h1>
      <p className="text-sm mb-8" style={{ color: "var(--t2, #9ca3af)" }}>
        Редакция от 29 мая 2026 г. • Finstat.kz
      </p>

      <section className="mb-8 text-sm leading-relaxed space-y-3">
        <h2 className="text-lg font-semibold">1. Какие данные мы обрабатываем</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Регистрационные: email, телефон, имя, данные компании (БИН/ИИН, наименование).</li>
          <li>Учётные: документы, проводки, контрагенты, зарплата и иная информация, которую вы вводите в Сервис.</li>
          <li>Технические: IP-адрес, тип браузера, cookies, журнал действий для безопасности и аналитики.</li>
          <li>Платёжные: идентификатор транзакции (без хранения полных данных банковской карты на наших серверах).</li>
        </ul>
      </section>

      <section className="mb-8 text-sm leading-relaxed space-y-3">
        <h2 className="text-lg font-semibold">2. Цели обработки</h2>
        <p>
          Предоставление доступа к Сервису, расчёт подписки, поддержка пользователей,
          улучшение продукта, выполнение требований законодательства РК. Данные учёта
          используются только для вашей работы в системе и не передаются третьим лицам для
          маркетинга без согласия.
        </p>
      </section>

      <section className="mb-8 text-sm leading-relaxed space-y-3">
        <h2 className="text-lg font-semibold">3. Хранение и безопасность</h2>
        <p>
          Данные размещаются в облачной инфраструктуре (Supabase, регион EU — Frankfurt).
          Применяются шифрование соединения (HTTPS), разграничение доступа по пользователям
          (RLS) и резервное копирование. Доступ сотрудников поддержки — только по обращению
          пользователя и в объёме, необходимом для решения проблемы.
        </p>
      </section>

      <section className="mb-8 text-sm leading-relaxed space-y-3">
        <h2 className="text-lg font-semibold">4. Передача третьим лицам</h2>
        <p>Мы можем привлекать:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Supabase — хостинг базы данных и аутентификация;</li>
          <li>Netlify — хостинг веб-приложения;</li>
          <li>Платёжные сервисы (Apipay и др.) — приём оплаты;</li>
          <li>Anthropic — обработка запросов AI-ассистента «Жанара» (без передачи паролей).</li>
        </ul>
        <p>
          Передача возможна также по законному запросу государственных органов Республики
          Казахстан.
        </p>
      </section>

      <section className="mb-8 text-sm leading-relaxed space-y-3">
        <h2 className="text-lg font-semibold">5. Срок хранения</h2>
        <p>
          Данные хранятся на протяжении срока использования Сервиса и до 3 лет после удаления
          аккаунта — для разрешения споров и исполнения налогового учёта, если иное не
          требуется законом. Вы можете запросить удаление аккаунта:{" "}
          <a href="mailto:info@finstat.kz">info@finstat.kz</a>.
        </p>
      </section>

      <section className="mb-8 text-sm leading-relaxed space-y-3">
        <h2 className="text-lg font-semibold">6. Ваши права</h2>
        <p>
          В соответствии с Законом РК «О персональных данных и их защите» вы вправе запросить
          доступ, исправление, ограничение обработки или удаление данных, отозвать согласие
          (если обработка основана на согласии), обратившись на{" "}
          <a href="mailto:info@finstat.kz">info@finstat.kz</a>.
        </p>
      </section>

      <section className="text-sm leading-relaxed space-y-3">
        <h2 className="text-lg font-semibold">7. Изменения политики</h2>
        <p>
          Актуальная версия всегда на этой странице. О существенных изменениях уведомим по
          email или баннером в личном кабинете.
        </p>
      </section>
    </article>
  );
}
