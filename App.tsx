import React, { useState } from 'react';
import { Login } from './pages/Login';
import { StoryWizard } from './pages/StoryWizard';
import { Library } from './pages/Library';
import { StoryEditor } from './pages/StoryEditor';
import { StoryReader } from './pages/StoryReader';
import { User, Story, WizardState } from './types';
import { Button } from './components/Button';
import { Plus, BookOpen, LogOut } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'dashboard' | 'create' | 'library' | 'editor' | 'read'>('dashboard');
  
  // State for storing saved stories
  const [stories, setStories] = useState<Story[]>([]);
  // State for the story currently being edited
  const [currentStory, setCurrentStory] = useState<Story | null>(null);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    setUser(null);
    setView('dashboard');
  };

  // Convert Wizard data to Story format and handle next steps
  const handleWizardFinish = (data: WizardState, action: 'save' | 'edit') => {
    const newStory: Story = {
      id: Date.now().toString(),
      title: `${data.character?.description}'s Adventure`,
      coverImage: data.generatedPages[0]?.imageUrl || data.character?.imageUrl || '',
      authorId: user!.id,
      authorName: user!.name,
      ageGroup: data.ageGroup!,
      character: { 
          name: data.character?.description || '', 
          description: data.character?.description || '', 
          imageUrl: data.character?.imageUrl || '' 
      },
      place: { 
          name: data.place?.description || '', 
          description: data.place?.description || '', 
          imageUrl: data.place?.imageUrl || '' 
      },
      time: data.time || 'Once upon a time',
      pages: data.generatedPages,
      styling: {
          titleColor: '#7209B7', // Default kid-purple
          fontFamily: 'font-comic'
      },
      createdAt: Date.now()
    };

    // Save initial version
    setStories(prev => [newStory, ...prev]);

    if (action === 'edit') {
        setCurrentStory(newStory);
        setView('editor');
    } else {
        setView('dashboard');
    }
  };

  const handleEditStory = (story: Story) => {
      setCurrentStory(story);
      setView('editor');
  }

  const handleReadStory = (story: Story) => {
      setCurrentStory(story);
      setView('read');
  }

  const handleSaveEditor = (updatedStory: Story) => {
      setStories(prev => prev.map(s => s.id === updatedStory.id ? updatedStory : s));
      setCurrentStory(null);
      setView('library'); // Go back to library after editing
  }

  // --- View Routing ---

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (view === 'create') {
    return (
      <StoryWizard 
        user={user} 
        onFinish={handleWizardFinish} 
        onCancel={() => setView('dashboard')} 
      />
    );
  }

  if (view === 'library') {
      return (
          <Library 
            stories={stories} 
            onEdit={handleEditStory} 
            onRead={handleReadStory} 
            onBack={() => setView('dashboard')}
          />
      )
  }

  if (view === 'editor' && currentStory) {
      return (
          <StoryEditor 
            story={currentStory} 
            onSave={handleSaveEditor} 
            onDiscard={() => setView('library')} 
          />
      )
  }

  if (view === 'read' && currentStory) {
      return (
          <StoryReader
            story={currentStory}
            onExit={() => setView('library')}
          />
      )
  }

  // Dashboard
  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto font-sans">
      <header className="flex flex-col md:flex-row justify-between items-center mb-12 gap-4 animate-fade-in">
        <div className="text-center md:text-left">
          <h1 className="text-4xl font-extrabold text-kid-purple mb-2">
            Welcome, {user.name}! 🌟
          </h1>
          <p className="text-xl text-gray-600">Ready to make some magic today?</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleLogout} 
          icon={<LogOut size={20}/>}
          className="bg-white"
        >
          Switch Account
        </Button>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 gap-8 px-4 animate-slide-up">
        {/* Create New Story Button */}
        <button 
          onClick={() => setView('create')}
          className="group relative bg-white p-8 rounded-[3rem] border-8 border-kid-blue shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 flex flex-col items-center text-center overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-kid-blue/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="bg-kid-blue/10 p-8 rounded-full mb-6 group-hover:bg-kid-blue/20 transition-colors">
            <Plus size={64} className="text-kid-blue" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-3 group-hover:text-kid-blue transition-colors">
            Create a New Story
          </h2>
          <p className="text-gray-500 text-lg">
            Start a brand new adventure with your AI friend!
          </p>
        </button>

        {/* Library Button */}
        <button 
          onClick={() => setView('library')}
          className="group relative bg-white p-8 rounded-[3rem] border-8 border-kid-yellow shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 flex flex-col items-center text-center overflow-hidden"
        >
           <div className="absolute inset-0 bg-gradient-to-b from-transparent to-kid-yellow/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="bg-kid-yellow/10 p-8 rounded-full mb-6 group-hover:bg-kid-yellow/20 transition-colors">
            <BookOpen size={64} className="text-kid-yellow" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-3 group-hover:text-yellow-600 transition-colors">
            See Previous e-Books
          </h2>
          <p className="text-gray-500 text-lg">
            Read and edit stories you've already made.
          </p>
        </button>
      </main>
    </div>
  );
}