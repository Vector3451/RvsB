import React, { useState } from 'react';
import { TopBar, Sidebar } from './components/layout/Layout';
import { MapView } from './components/views/MapView';
import { TrainingView } from './components/views/TrainingView';
import { BuilderView } from './components/views/BuilderView';

export default function App() {
  const [activeTab, setActiveTab] = useState('map');

  const renderView = () => {
    switch (activeTab) {
      case 'map': return <MapView />;
      case 'builder': return <BuilderView />;
      case 'training': return <TrainingView />;
      default: return <MapView />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body selection:bg-primary/30 overflow-hidden">
      <TopBar />
      {/* Sidebar is an overlay — it hovers above content, so main always has a fixed 64px offset */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="pt-14 h-screen relative ml-16">
        {renderView()}
      </main>
    </div>
  );
}
