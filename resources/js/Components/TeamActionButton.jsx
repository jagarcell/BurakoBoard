import PrimaryButton from '@/Components/PrimaryButton';

/**
 * Unified action button for team management (Create team, Add team, Edit team)
 * with consistent sizing and styling applied automatically.
 */
export default function TeamActionButton({ children, ...props }) {
    return (
        <PrimaryButton
            className="min-h-10 justify-center rounded-2xl px-5 text-[11px]"
            {...props}
        >
            {children}
        </PrimaryButton>
    );
}
