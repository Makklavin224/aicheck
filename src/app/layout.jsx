import "./globals.css";

export const metadata = {
  title: "ВЕКТРА — Проверка документов",
  description: "Система проверки конкурентных предложений на подлинность",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body className="bg-gray-50 text-slate-800">{children}</body>
    </html>
  );
}
