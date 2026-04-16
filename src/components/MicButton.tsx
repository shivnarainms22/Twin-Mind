'use client';

interface MicButtonProps {
  isRecording: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function MicButton({ isRecording, onClick, disabled }: MicButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={isRecording ? 'Stop recording' : 'Start recording'}
      className={`
        w-11 h-11 rounded-full border-none cursor-pointer
        flex items-center justify-center text-lg
        transition-colors shrink-0
        ${isRecording
          ? 'bg-danger text-white mic-pulse'
          : 'bg-accent text-black hover:bg-accent/80'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {isRecording ? '■' : '●'}
    </button>
  );
}
