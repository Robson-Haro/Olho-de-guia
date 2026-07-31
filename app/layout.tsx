import type { Metadata } from 'next';
import './globals.css';
import './settings.css';

export const metadata: Metadata = { title: 'Olho de Águia | Talent Hunter', description: 'Inteligência de hunting e gestão de candidatos' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
