import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const player = vi.hoisted(() => ({
  seek: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
  video: { duration: 100 },
}));
vi.mock("dplayer", () => ({
  default: class {
    seek = player.seek;
    destroy = player.destroy;
    on = player.on;
    video = player.video;
  },
}));
import { VideoPlayer } from "../video-player";

/**
 * 视频引用时间定位测试。
 *
 * @author 称霸幼儿园
 */
beforeEach(() => {
  player.seek.mockClear();
  player.destroy.mockClear();
  player.on.mockClear();
});

describe("VideoPlayer", () => {
  /** 越界时间回到起点，非法时间不提交定位请求。 */
  it.each([120, -1, Number.NaN])("处理无效或越界秒数 %s", async (time) => {
    render(<VideoPlayer url="/video.mp4" startTime={time} />);
    await waitFor(() => expect(player.on).toHaveBeenCalled());
    player.on.mock.calls[0]?.[1]();
    if (time === 120) expect(player.seek).toHaveBeenCalledWith(0);
    else expect(player.seek).not.toHaveBeenCalled();
  });
  /** 元数据就绪后跳到引用秒数，卸载时释放播放器。 */
  it("加载后定位并释放实例", async () => {
    const { unmount } = render(<VideoPlayer url="/video.mp4" startTime={12.345} />);
    await waitFor(() =>
      expect(player.on).toHaveBeenCalledWith("loadedmetadata", expect.any(Function)),
    );
    player.on.mock.calls[0]?.[1]();
    expect(player.seek).toHaveBeenCalledWith(12.345);
    unmount();
    expect(player.destroy).toHaveBeenCalledOnce();
  });

  /** 传 navigationKey 时换时间点只 seek，不销毁重建播放器。 */
  it("导航版本变化时原地跳转", async () => {
    const view = render(<VideoPlayer url="/video.mp4" startTime={10} navigationKey={1} />);
    await waitFor(() => expect(player.on).toHaveBeenCalledWith("loadedmetadata", expect.any(Function)));
    player.on.mock.calls[0]?.[1]();
    player.seek.mockClear();

    view.rerender(<VideoPlayer url="/video.mp4" startTime={20} navigationKey={2} />);

    expect(player.destroy).not.toHaveBeenCalled();
    expect(player.seek).toHaveBeenCalledWith(20);
  });

  /** 不传 navigationKey 时保持按 startTime 销毁重建的旧行为。 */
  it("未传导航版本时按时间重建", async () => {
    const view = render(<VideoPlayer url="/video.mp4" startTime={10} />);
    await waitFor(() => expect(player.on).toHaveBeenCalled());

    view.rerender(<VideoPlayer url="/video.mp4" startTime={20} />);

    await waitFor(() => expect(player.destroy).toHaveBeenCalledOnce());
  });
});
