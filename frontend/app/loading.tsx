// frontend/app/loading.tsx
export default function RootLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream">
      <div
        style={{
          width: '56px',
          height: '56px',
          border: '4px solid rgba(193, 132, 251, 0.2)',   // primary at 20%
          borderTopColor: '#C184FB',                        // pure primary
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
    </div>
  );
}