import './globals.css';
import { Toaster } from 'sonner';
import { getSiteData } from '@/lib/getSiteData';
import inlineScript from './faviconInlineScript';
export async function generateMetadata() {
  const { name, slogan, favicon } = await getSiteData('fr'); // default locale for root
  return {
    title: {
      default: name,
      template: `${name} | %s`,   // site name first, then page title
    },
    description: slogan,
    icons: { icon: favicon },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
     <head>
      <link
  href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Noto+Naskh+Arabic:wght@400;700&display=swap"
  rel="stylesheet"
/>
     <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
      </head>
      <body>
        
        {children}
        <Toaster position="top-right" richColors closeButton theme="light" />
        
      </body>
    </html>
  );
}