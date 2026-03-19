import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import VoiceAliasManager from '@/Components/VoiceAliasManager';

const mockAliases = [
    { id: 1, alias: 'morocco', keyword: 'burako' },
    { id: 2, alias: 'canada', keyword: 'canastra' },
];

function renderManager(overrides = {}) {
    const props = {
        aliases: mockAliases,
        isLoading: false,
        error: null,
        onAdd: vi.fn().mockResolvedValue({}),
        onRemove: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    return { ...render(<VoiceAliasManager {...props} />), props };
}

describe('VoiceAliasManager', () => {
    describe('alias list rendering', () => {
        it('renders the section heading', () => {
            renderManager();
            expect(screen.getByText(/voice aliases/i)).toBeInTheDocument();
        });

        it('renders each alias as misheard → keyword', () => {
            renderManager();
            expect(screen.getByText('morocco')).toBeInTheDocument();
            expect(screen.getByText('burako')).toBeInTheDocument();
            expect(screen.getByText('canada')).toBeInTheDocument();
            expect(screen.getByText('canastra')).toBeInTheDocument();
        });

        it('shows an empty state message when there are no aliases', () => {
            renderManager({ aliases: [] });
            expect(screen.getByText(/no aliases yet/i)).toBeInTheDocument();
        });

        it('shows a loading message while fetching', () => {
            renderManager({ isLoading: true, aliases: [] });
            expect(screen.getByText(/loading aliases/i)).toBeInTheDocument();
        });

        it('shows an error message when the fetch failed', () => {
            renderManager({ error: 'Failed to load voice aliases.', aliases: [] });
            expect(screen.getByText(/failed to load voice aliases/i)).toBeInTheDocument();
        });
    });

    describe('add form', () => {
        it('renders both input fields and the Add button', () => {
            renderManager();
            expect(screen.getByLabelText(/misheard/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/intended/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument();
        });

        it('renders a text input for misheard word when misheardOptions is empty', () => {
            renderManager();
            const misheardField = screen.getByLabelText(/misheard/i);
            expect(misheardField.tagName.toLowerCase()).toBe('input');
        });

        it('renders a select dropdown for misheard word when misheardOptions is provided', () => {
            renderManager({ misheardOptions: ['burako', 'morocco', 'minus'] });
            const misheardField = screen.getByLabelText(/misheard/i);
            expect(misheardField.tagName.toLowerCase()).toBe('select');
        });

        it('shows each misheard candidate as a dropdown option', () => {
            renderManager({ misheardOptions: ['burako', 'morocco', 'minus'] });
            expect(screen.getByRole('option', { name: 'burako' })).toBeInTheDocument();
            expect(screen.getByRole('option', { name: 'morocco' })).toBeInTheDocument();
            expect(screen.getByRole('option', { name: 'minus' })).toBeInTheDocument();
        });

        it('shows a placeholder option when the dropdown is unselected', () => {
            renderManager({ misheardOptions: ['burako', 'morocco'] });
            expect(screen.getByRole('option', { name: /pick misheard word/i })).toBeInTheDocument();
        });

        it('calls onAdd with the selected dropdown word on valid submit', async () => {
            const onAdd = vi.fn().mockResolvedValue({});
            renderManager({ onAdd, misheardOptions: ['morocco', 'burako'] });

            fireEvent.change(screen.getByLabelText(/misheard/i), { target: { value: 'morocco' } });
            fireEvent.change(screen.getByLabelText(/intended/i), { target: { value: 'burako' } });
            fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

            await waitFor(() => {
                expect(onAdd).toHaveBeenCalledWith('morocco', 'burako');
            });
        });

        it('shows client-side error when submitted with empty fields', async () => {
            renderManager();
            fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
            expect(await screen.findByText(/both fields are required/i)).toBeInTheDocument();
        });

        it('shows client-side error when dropdown is submitted without selection', async () => {
            renderManager({ misheardOptions: ['morocco', 'burako'] });
            // leave the select at its default placeholder (empty string)
            fireEvent.change(screen.getByLabelText(/intended/i), { target: { value: 'burako' } });
            fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
            expect(await screen.findByText(/both fields are required/i)).toBeInTheDocument();
        });

        it('calls onAdd with trimmed values on valid submit', async () => {
            const onAdd = vi.fn().mockResolvedValue({});
            renderManager({ onAdd });

            fireEvent.change(screen.getByLabelText(/misheard/i), { target: { value: '  Morocco  ' } });
            fireEvent.change(screen.getByLabelText(/intended/i), { target: { value: '  Burako  ' } });
            fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

            await waitFor(() => {
                expect(onAdd).toHaveBeenCalledWith('Morocco', 'Burako');
            });
        });

        it('clears the inputs after a successful add', async () => {
            const onAdd = vi.fn().mockResolvedValue({});
            renderManager({ onAdd });

            const misheardInput = screen.getByLabelText(/misheard/i);
            const intendedInput = screen.getByLabelText(/intended/i);

            fireEvent.change(misheardInput, { target: { value: 'foo' } });
            fireEvent.change(intendedInput, { target: { value: 'bar' } });
            fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

            await waitFor(() => {
                expect(misheardInput.value).toBe('');
                expect(intendedInput.value).toBe('');
            });
        });

        it('shows server error when onAdd rejects with a validation message', async () => {
            const apiError = Object.assign(new Error('Dup'), {
                response: {
                    data: { errors: { alias: ['You already have an alias for that word.'] } },
                },
            });
            const onAdd = vi.fn().mockRejectedValueOnce(apiError);
            renderManager({ onAdd });

            fireEvent.change(screen.getByLabelText(/misheard/i), { target: { value: 'morocco' } });
            fireEvent.change(screen.getByLabelText(/intended/i), { target: { value: 'burako' } });
            fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

            expect(await screen.findByText(/you already have an alias/i)).toBeInTheDocument();
        });

        it('disables the Add button while a submission is in flight', async () => {
            let resolve;
            const onAdd = vi.fn().mockReturnValueOnce(new Promise((r) => { resolve = r; }));
            renderManager({ onAdd });

            fireEvent.change(screen.getByLabelText(/misheard/i), { target: { value: 'foo' } });
            fireEvent.change(screen.getByLabelText(/intended/i), { target: { value: 'bar' } });
            fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

            expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();

            await act(async () => { resolve({}); });
        });
    });

    describe('delete alias', () => {
        it('renders a delete button for each alias', () => {
            renderManager();
            const deleteButtons = screen.getAllByRole('button', { name: /remove alias/i });
            expect(deleteButtons).toHaveLength(mockAliases.length);
        });

        it('calls onRemove with the correct alias id', async () => {
            const onRemove = vi.fn().mockResolvedValue(undefined);
            renderManager({ onRemove });

            const removeBtn = screen.getByLabelText(/remove alias: morocco/i);
            fireEvent.click(removeBtn);

            await waitFor(() => {
                expect(onRemove).toHaveBeenCalledWith(1);
            });
        });

        it('disables the delete button for the alias being deleted', async () => {
            let resolve;
            const onRemove = vi.fn().mockReturnValueOnce(new Promise((r) => { resolve = r; }));
            renderManager({ onRemove });

            const removeBtn = screen.getByLabelText(/remove alias: morocco/i);
            fireEvent.click(removeBtn);

            expect(removeBtn).toBeDisabled();

            await act(async () => { resolve(undefined); });
        });
    });

    describe('accessibility', () => {
        it('error messages have role="alert"', () => {
            renderManager({ error: 'Something went wrong', aliases: [] });
            expect(screen.getByRole('alert')).toBeInTheDocument();
        });

        it('validation error has role="alert"', async () => {
            renderManager();
            fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
            const alert = await screen.findByRole('alert');
            expect(alert).toBeInTheDocument();
        });
    });
});
