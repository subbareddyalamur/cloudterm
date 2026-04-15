import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { K8sDashboard } from '@/pages/k8s'

function RdpPage() {
  return <div>RDP Client</div>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />} />
        <Route path="/k8s" element={<K8sDashboard />} />
        <Route path="/rdp" element={<RdpPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
