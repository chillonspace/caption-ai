export default function AdminBillingPage() {
  if (typeof window !== 'undefined') {
    window.location.replace('/admin');
  }
  return null;
}


