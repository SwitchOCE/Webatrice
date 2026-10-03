import { act, fireEvent, screen } from '@testing-library/react';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';

import { connectedState, renderWithProviders } from '../../../../__test-utils__';

const hoisted = vi.hoisted(() => ({
  loadImage: vi.fn(),
  encodeAvatar: vi.fn(),
}));

vi.mock('./encodeAvatar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./encodeAvatar')>()),
  loadImage: hoisted.loadImage,
  encodeAvatar: hoisted.encodeAvatar,
}));

import ChangeAvatarDialog from './ChangeAvatarDialog';

function setup() {
  const handleClose = vi.fn();
  const view = renderWithProviders(<ChangeAvatarDialog isOpen handleClose={handleClose} />, {
    preloadedState: connectedState,
  });
  const accountImage = vi.mocked(view.webClient.request.session.accountImage);
  return { ...view, handleClose, accountImage };
}

const pickFile = async (file: File) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('ChangeAvatarDialog.browse'), { target: { files: [file] } });
  });
};

const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'AccountDialogs.label.ok' }));
  });
};

describe('ChangeAvatarDialog', () => {
  beforeAll(() => {
    URL.createObjectURL ??= () => '';
    URL.revokeObjectURL ??= () => undefined;
  });

  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes the avatar when confirmed without choosing an image', async () => {
    const { accountImage } = setup();

    expect(screen.getByText('ChangeAvatarDialog.noImage')).toBeInTheDocument();
    await submit();

    expect(accountImage).toHaveBeenCalledWith(new Uint8Array(), expect.any(Function), expect.any(Function));
  });

  it('previews a chosen image and uploads its downscaled JPEG encoding', async () => {
    const image = { naturalWidth: 2048, naturalHeight: 2048 } as HTMLImageElement;
    hoisted.loadImage.mockResolvedValue(image);
    hoisted.encodeAvatar.mockResolvedValue(new Uint8Array([0xff, 0xd8]));
    const { accountImage } = setup();

    await pickFile(new File(['png'], 'me.png', { type: 'image/png' }));
    expect(screen.getByAltText('ChangeAvatarDialog.previewAlt')).toHaveAttribute('src', 'blob:avatar');

    await submit();

    expect(hoisted.encodeAvatar).toHaveBeenCalledWith(image);
    expect(accountImage).toHaveBeenCalledWith(new Uint8Array([0xff, 0xd8]), expect.any(Function), expect.any(Function));
  });

  it('refuses an unreadable file instead of silently removing the avatar', async () => {
    hoisted.loadImage.mockRejectedValue(new Error('bad'));
    const { accountImage } = setup();

    await pickFile(new File(['nope'], 'me.png', { type: 'image/png' }));
    expect(screen.getByText('ChangeAvatarDialog.invalidImage')).toBeInTheDocument();

    await submit();
    expect(accountImage).not.toHaveBeenCalled();
  });

  it('explains a server refusal and stays open', async () => {
    const { accountImage, handleClose } = setup();

    await submit();
    act(() => {
      accountImage.mock.calls[0][2]!(Response_ResponseCode.RespFunctionNotAllowed);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('AccountDialogs.error.avatarNotAllowed');
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('closes once the server accepts the avatar', async () => {
    const { accountImage, handleClose } = setup();

    await submit();
    act(() => {
      accountImage.mock.calls[0][1]!();
    });

    expect(handleClose).toHaveBeenCalled();
  });
});
