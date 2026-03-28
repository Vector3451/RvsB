import React, { useState } from 'react';
import { TopBar, Sidebar } from './components/layout/Layout';
import { MapView } from './components/views/MapView';
import { NodeDetailView } from './components/views/NodeDetailView';
import { TrainingView } from './components/views/TrainingView';
import { BuilderView } from './components/views/BuilderView';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const renderView = () => {
    switch (activeTab) {
      case 'map':
        return <MapView />;
      case 'dashboard':
        return <NodeDetailView />;
      case 'builder':
        return <BuilderView />;
      case 'training':
        return <TrainingView />;
      default:
        return <NodeDetailView />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body selection:bg-primary/30 overflow-hidden">
      <TopBar />
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      <main className={`pt-16 h-screen relative transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
        {renderView()}
      </main>
    </div>
  );
}
