describe('index', () => {
  const booted = vi.fn();

  beforeEach(() => {
    booted.mockClear();
    vi.resetModules();
    vi.doMock('./boot', () => {
      booted();
      return {};
    });
  });

  afterEach(() => {
    vi.doUnmock('./boot');
    delete window.Cockatrice;
  });

  const loadEntry = async () => {
    await import('./index');
    await vi.dynamicImportSettled();
  };

  it('loads the app on a supported device', async () => {
    window.Cockatrice = { unsupportedDevice: false };
    await loadEntry();
    expect(booted).toHaveBeenCalledOnce();
  });

  it('does not load the app on a phone or tablet', async () => {
    window.Cockatrice = { unsupportedDevice: true };
    await loadEntry();
    expect(booted).not.toHaveBeenCalled();
  });

  it('does not load the app when a required browser feature is missing', async () => {
    window.Cockatrice = { browserSupport: { missingRequired: ['webSocket'], missingOptional: [] } };
    await loadEntry();
    expect(booted).not.toHaveBeenCalled();
  });
});
