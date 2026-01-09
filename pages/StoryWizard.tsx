import React, { useState, useEffect, useCallback } from 'react';
import { WizardState, WizardStep, AgeGroup, User, UserRole, Badge, StoryPage } from '../types';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { BadgeNotification } from '../components/BadgeNotification';
import { generateImage, generateSuggestions, generateStorySegment } from '../services/geminiService';
import { Mic, Volume2, ArrowRight, Wand2, RefreshCw, Star, Edit, Save, Printer, HelpCircle, Check } from 'lucide-react';

interface StoryWizardProps {
  user: User;
  onFinish: (storyData: WizardState, action: 'save' | 'edit') => void;
  onCancel: () => void;
}

// Interaction states for the 3-step inactivity flow
type InteractionMode = 'input' | 'options' | 'confirmation';

interface OptionCard {
  label: string;
  imageUrl: string | null;
  loading: boolean;
}

export const StoryWizard: React.FC<StoryWizardProps> = ({ user, onFinish, onCancel }) => {
  const [state, setState] = useState<WizardState>({
    step: WizardStep.AGE_SELECTION,
    ageGroup: null,
    character: null,
    place: null,
    time: null,
    plotInput: '',
    generatedPages: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [inactivityTimer, setInactivityTimer] = useState(0);
  
  // New Inactivity Flow State
  const [mode, setMode] = useState<InteractionMode>('input');
  const [suggestedOptions, setSuggestedOptions] = useState<OptionCard[]>([]);
  const [autoSelectCandidate, setAutoSelectCandidate] = useState<OptionCard | null>(null);

  // Gamification State
  const [currentPoints, setCurrentPoints] = useState(user.points);
  const [newBadge, setNewBadge] = useState<Badge | null>(null);

  // Reset timer on user interaction
  const resetTimer = useCallback(() => {
    setInactivityTimer(0);
    // If user interacts, go back to input mode unless we are deep in automation (handled below)
    if (mode === 'confirmation') {
        // keep confirmation until they explicitly cancel or accept
    } else {
        setMode('input');
    }
  }, [mode]);

  // Main Timer & State Machine Logic
  useEffect(() => {
    // Only run timer for creation steps
    const activeSteps = [WizardStep.CHARACTER, WizardStep.PLACE, WizardStep.TIME];
    if (isLoading || !activeSteps.includes(state.step)) return;

    const interval = setInterval(() => {
      setInactivityTimer(prev => {
        const t = prev + 1;

        // Step 1: 30s -> Show 3 Options
        if (t === 30 && mode === 'input') {
           handleShowOptions();
        }

        // Step 2: 60s (30s after options) -> Show Single Confirmation
        if (t === 60 && mode === 'options') {
           handleShowConfirmation();
        }

        // Step 3: 70s (10s after confirmation) -> Auto Select
        if (t === 70 && mode === 'confirmation') {
           handleAutoSelect();
        }

        return t;
      });
    }, 1000);

    const events = ['mousemove', 'keydown', 'touchstart'];
    const handler = () => {
        // Only reset if we are in input mode or early options mode. 
        // If we are in confirmation, we might want to let the user cancel manually or click.
        // For simplicity, any interaction resets to input unless explicitly handled.
        if (mode === 'input') setInactivityTimer(0);
    };
    
    events.forEach(e => window.addEventListener(e, handler));

    return () => {
      clearInterval(interval);
      events.forEach(e => window.removeEventListener(e, handler));
    };
  }, [state.step, mode, isLoading]);

  // --- Logic Handlers ---

  const getContext = () => {
      if (state.step === WizardStep.PLACE) return 'place';
      if (state.step === WizardStep.TIME) return 'time';
      return 'character';
  }

  const handleShowOptions = async () => {
    setMode('options');
    const context = getContext();
    
    // 1. Get Text Suggestions
    const texts = await generateSuggestions(context, state.ageGroup || AgeGroup.EARLY_READER);
    
    // 2. Initialize options with loading state for images
    const initialOptions = texts.map(t => ({ label: t, imageUrl: null, loading: true }));
    setSuggestedOptions(initialOptions);

    // 3. Generate images for options (in background)
    // We do this one by one to avoid rate limits if possible, or parallel if quota allows.
    // Given the quota error history, we'll try parallel but with a fallback in the service.
    texts.forEach(async (text, index) => {
        try {
            const prompt = state.step === WizardStep.PLACE 
                ? `A cartoon background of ${text}` 
                : `A cute ${text} character`;
            
            const url = await generateImage(prompt);
            
            setSuggestedOptions(prev => {
                const next = [...prev];
                next[index] = { ...next[index], imageUrl: url, loading: false };
                return next;
            });
        } catch (e) {
             setSuggestedOptions(prev => {
                const next = [...prev];
                next[index] = { ...next[index], loading: false }; // Leave image null (placeholder)
                return next;
            });
        }
    });
  };

  const handleShowConfirmation = () => {
    setMode('confirmation');
    // Pick the first option, or a default if empty
    const candidate = suggestedOptions[0] || { label: "A Magical Friend", imageUrl: null, loading: false };
    setAutoSelectCandidate(candidate);
  };

  const handleAutoSelect = () => {
      if (autoSelectCandidate) {
          handleSelection(autoSelectCandidate.label, autoSelectCandidate.imageUrl || undefined);
      } else {
          handleSelection("A Magical Friend");
      }
  };

  const handleSelection = async (choice: string, preGeneratedImage?: string) => {
      setInactivityTimer(0);
      setMode('input'); // Reset mode for next step
      setIsLoading(true);
      
      try {
        if (state.step === WizardStep.CHARACTER) {
            const img = preGeneratedImage || await generateImage(`A cute ${choice} character`);
            setState(prev => ({ ...prev, character: { description: choice, imageUrl: img } }));
        } else if (state.step === WizardStep.PLACE) {
            const img = preGeneratedImage || await generateImage(`A cartoon background of ${choice}`);
            setState(prev => ({ ...prev, place: { description: choice, imageUrl: img } }));
        } else if (state.step === WizardStep.TIME) {
            setState(prev => ({ ...prev, time: choice }));
        }
      } catch (e) {
          console.error(e);
      } finally {
        setIsLoading(false);
      }
  };

  const awardPoints = (amount: number) => {
      setCurrentPoints(prev => prev + amount);
  };

  const checkBadges = (step: WizardStep) => {
      let badge: Badge | null = null;
      if (step === WizardStep.CHARACTER) {
          badge = { id: 'char_creator', name: 'Character Creator', icon: '🦁', description: 'You made a new friend!' };
      } else if (step === WizardStep.PLACE) {
          badge = { id: 'world_builder', name: 'World Builder', icon: '🌍', description: 'You discovered a new place!' };
      }

      if (badge) {
          setNewBadge(badge);
      }
  };

  const confirmStep = () => {
      awardPoints(10);
      checkBadges(state.step);
      setState(prev => ({ ...prev, step: prev.step + 1 }));
      setMode('input'); // Reset for next step
      setSuggestedOptions([]);
      setAutoSelectCandidate(null);
  };

  const generatePage = async () => {
      if (!state.character || !state.place || !state.time) return;
      setIsLoading(true);
      
      const segment = await generateStorySegment({
          character: state.character.description,
          place: state.place.description,
          time: state.time,
          plot: state.plotInput || "They started an adventure."
      }, state.ageGroup!);

      const img = await generateImage(segment.imagePrompt);
      
      const newPage: StoryPage = {
          text: segment.text,
          imageUrl: img,
          imagePrompt: segment.imagePrompt
      };

      awardPoints(50);
      setNewBadge({ id: 'master_story', name: 'Master Storyteller', icon: '👑', description: 'You created a whole story!' });

      setState(prev => ({
          ...prev,
          generatedPages: [...prev.generatedPages, newPage],
          step: WizardStep.PREVIEW
      }));
      setIsLoading(false);
  };

  const handleDownload = () => {
      window.print();
  };

  // --- Render Steps ---

  const renderAgeSelection = () => (
    <div className="text-center space-y-8 animate-fade-in">
      <h2 className="text-3xl font-bold text-kid-blue">How old are you?</h2>
      <div className="flex flex-col gap-4 max-w-sm mx-auto">
        {Object.values(AgeGroup).map(age => (
          <Button 
            key={age} 
            size="lg" 
            variant="secondary"
            onClick={() => setState(prev => ({ ...prev, ageGroup: age, step: WizardStep.CHARACTER }))}
          >
            I am {age} years old
          </Button>
        ))}
      </div>
    </div>
  );

  const renderInputStep = (title: string, value: string | null, field: 'character' | 'place' | 'time', placeholder: string) => {
    const hasValue = state[field] !== null;
    const data = state[field];
    
    const imageUrl = (typeof data === 'object' && data !== null && 'imageUrl' in data) ? data.imageUrl : null;

    return (
      <div className="flex flex-col items-center space-y-6 w-full max-w-4xl mx-auto">
        <h2 className="text-4xl font-bold text-kid-purple">{title}</h2>
        
        {/* Main Visual Area */}
        <div className="w-full relative min-h-[400px] flex flex-col items-center justify-center">
            
            {/* Case 1: Loading */}
            {isLoading && (
               <div className="animate-bounce text-6xl">🎨</div>
            )}

            {/* Case 2: Selected Value Exists */}
            {!isLoading && imageUrl && (
                <div className="w-64 h-64 bg-white rounded-3xl border-4 border-kid-blue overflow-hidden shadow-lg mb-4">
                    <img src={imageUrl} alt="Selected" className="w-full h-full object-cover" />
                </div>
            )}

            {/* Case 3: Inactivity - Options Mode (30s) */}
            {!isLoading && !hasValue && mode === 'options' && (
                <div className="w-full animate-fade-in">
                    <p className="text-xl font-bold text-kid-blue mb-6 text-center">Need a hint? Pick one!</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {suggestedOptions.map((opt, idx) => (
                            <button 
                                key={idx}
                                onClick={() => handleSelection(opt.label, opt.imageUrl || undefined)}
                                className="bg-white p-4 rounded-3xl border-4 border-kid-yellow hover:border-kid-pink hover:scale-105 transition-all shadow-md flex flex-col items-center gap-3"
                            >
                                <div className="w-32 h-32 bg-gray-100 rounded-2xl overflow-hidden flex items-center justify-center">
                                    {opt.loading ? (
                                        <span className="text-2xl animate-spin">⏳</span>
                                    ) : opt.imageUrl ? (
                                        <img src={opt.imageUrl} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-4xl">✨</span>
                                    )}
                                </div>
                                <span className="font-bold text-gray-700">{opt.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Case 4: Inactivity - Confirmation Mode (60s) */}
            {!isLoading && !hasValue && mode === 'confirmation' && autoSelectCandidate && (
                <div className="bg-white p-8 rounded-[3rem] border-8 border-kid-green shadow-2xl animate-bounce-in max-w-md w-full text-center">
                    <h3 className="text-2xl font-bold text-kid-purple mb-4">How about this?</h3>
                    <div className="w-48 h-48 mx-auto bg-gray-100 rounded-3xl overflow-hidden mb-4 border-4 border-gray-100">
                         {autoSelectCandidate.imageUrl ? (
                            <img src={autoSelectCandidate.imageUrl} className="w-full h-full object-cover" />
                         ) : (
                            <div className="w-full h-full flex items-center justify-center text-6xl">🤔</div>
                         )}
                    </div>
                    <p className="text-xl font-bold text-gray-700 mb-6">{autoSelectCandidate.label}</p>
                    <div className="flex gap-4 justify-center">
                        <Button variant="secondary" onClick={() => setMode('options')}>No, let me pick</Button>
                        <Button variant="primary" icon={<Check />} onClick={() => handleSelection(autoSelectCandidate.label, autoSelectCandidate.imageUrl || undefined)}>
                            Yes, it's okay!
                        </Button>
                    </div>
                </div>
            )}

            {/* Case 5: Standard Input Mode (0-30s) */}
            {!isLoading && !hasValue && mode === 'input' && (
               <div className="w-full max-w-xl text-center">
                   <div className="w-full h-64 bg-white/50 rounded-3xl border-4 border-dashed border-gray-300 flex items-center justify-center mb-8">
                       <span className="text-gray-400 font-bold text-xl">Your idea appears here...</span>
                   </div>
                   {/* Encouragement text only appears after a few seconds */}
                   {inactivityTimer > 10 && (
                       <p className="text-kid-pink font-bold animate-pulse mb-4">Don't be shy! Type something...</p>
                   )}
               </div>
            )}

        </div>

        {/* Input Controls (Hidden if in strict confirmation mode to reduce clutter, or kept for override) */}
        {!hasValue && mode !== 'confirmation' && (
             <div className="w-full max-w-xl space-y-4">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder={placeholder}
                        className="flex-1 p-4 rounded-2xl border-4 border-gray-300 text-xl focus:border-kid-pink outline-none"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSelection(e.currentTarget.value);
                        }}
                        // Reset timer on type
                        onChange={() => setInactivityTimer(0)}
                    />
                    <Button variant="secondary" icon={<Mic size={24} />} onClick={() => alert("Microphone check permission!")} />
                </div>
                <p className="text-gray-500 text-center">Type or say it, then press Enter!</p>
             </div>
        )}

        {/* Confirmation Buttons if value exists */}
        {hasValue && (
            <div className="flex gap-4">
                <Button variant="outline" icon={<RefreshCw />} onClick={() => setState(prev => ({...prev, [field]: null}))}>
                    Change
                </Button>
                <Button variant="primary" icon={<ArrowRight />} size="lg" onClick={confirmStep}>
                    Next
                </Button>
            </div>
        )}
      </div>
    );
  };

  const renderPlotStep = () => (
      <div className="flex flex-col items-center space-y-6 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-kid-green">What happens next?</h2>
          
          <div className="flex gap-4 w-full">
            <div className="flex-1 bg-white p-4 rounded-2xl border-4 border-kid-green shadow-sm">
                <p className="text-gray-500 text-sm mb-2">Character: {state.character?.description}</p>
                <p className="text-gray-500 text-sm mb-2">Place: {state.place?.description}</p>
            </div>
          </div>

          <textarea 
            className="w-full h-40 p-4 rounded-2xl border-4 border-gray-300 text-xl focus:border-kid-green outline-none resize-none"
            placeholder="Once upon a time..."
            value={state.plotInput}
            onChange={(e) => setState(prev => ({...prev, plotInput: e.target.value}))}
          />
          
          <Button 
            disabled={isLoading} 
            size="xl" 
            variant="primary" 
            icon={<Wand2 />} 
            onClick={generatePage}
          >
            {isLoading ? "Creating Magic..." : "Make My Story!"}
          </Button>
      </div>
  );

  const renderPreview = () => (
      <div className="flex flex-col items-center space-y-6 w-full">
          <h2 className="text-4xl font-bold text-kid-pink">Your Story is Ready!</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
              <div className="aspect-square bg-gray-100 rounded-3xl overflow-hidden border-8 border-white shadow-xl">
                  <img 
                    src={state.generatedPages[0]?.imageUrl} 
                    alt="Story Page" 
                    className="w-full h-full object-cover"
                  />
              </div>
              <div className="flex flex-col justify-center space-y-4">
                  <div className="bg-white p-6 rounded-3xl border-4 border-kid-yellow shadow-lg">
                      <p className="text-2xl font-comic leading-relaxed text-gray-700">
                          {state.generatedPages[0]?.text}
                      </p>
                  </div>
                  <Button variant="secondary" icon={<Volume2 />}>Read to me</Button>
              </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full max-w-4xl bg-white p-6 rounded-3xl border-4 border-kid-blue mt-8">
              <h3 className="text-2xl font-bold text-kid-blue mb-4 text-center">What do you want to do?</h3>
              <div className="flex flex-wrap gap-4 justify-center">
                  <Button variant="accent" icon={<Edit />} onClick={() => onFinish(state, 'edit')}>
                      Editing
                  </Button>

                  <Button variant="primary" icon={<Save />} onClick={() => onFinish(state, 'save')}>
                      Save
                  </Button>
                  
                  {user.role === UserRole.STUDENT && (
                      <Button variant="outline" icon={<Printer />} onClick={handleDownload}>
                          Print
                      </Button>
                  )}
              </div>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen p-4 pb-20 max-w-5xl mx-auto flex flex-col">
      {/* Top Bar: Points & Progress */}
      <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm" onClick={onCancel}>Exit</Button>
          <div className="flex items-center bg-white px-4 py-2 rounded-full border-4 border-kid-yellow shadow-sm">
              <Star className="text-kid-yellow fill-current mr-2" />
              <span className="font-bold text-xl text-kid-purple">{currentPoints} pts</span>
          </div>
      </div>

      {state.step > WizardStep.AGE_SELECTION && (
          <ProgressBar currentStep={state.step} totalSteps={6} />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-center">
        {state.step === WizardStep.AGE_SELECTION && renderAgeSelection()}
        {state.step === WizardStep.CHARACTER && renderInputStep("Who is in your story?", state.character?.description || null, 'character', "e.g., A brave robot")}
        {state.step === WizardStep.PLACE && renderInputStep("Where are they?", state.place?.description || null, 'place', "e.g., On Mars")}
        {state.step === WizardStep.TIME && renderInputStep("When is it?", state.time, 'time', "e.g., In the future")}
        {state.step === WizardStep.PLOT && renderPlotStep()}
        {state.step === WizardStep.PREVIEW && renderPreview()}
      </div>

      <BadgeNotification badge={newBadge} onClose={() => setNewBadge(null)} />
    </div>
  );
};