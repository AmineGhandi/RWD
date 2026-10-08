using Microsoft.AspNetCore.SignalR;
namespace Rwd;
public class GamePublisher(IHubContext<GameHub> hub, GameStore store)
{
    public Task Publish(Room room) {
        KeyValuePair<string, Attachment>[] connections;
        lock (room.Gate) connections = room.Connections.ToArray();
        return Task.WhenAll(connections.Select(c => hub.Clients.Client(c.Key).SendAsync("State", store.View(room, c.Value.Role == "host"))));
    }
    public Task Close(Room room, string reason) {
        KeyValuePair<string, Attachment>[] connections;
        lock (room.Gate) connections = room.Connections.ToArray();
        return Task.WhenAll(connections.Select(c => hub.Clients.Client(c.Key).SendAsync("Closed", reason)));
    }
}
public class GameHub(GameStore store, GamePublisher publisher) : Hub
{
    public async Task Attach(string code, string role, string token) {
        try { store.Detach(Context.ConnectionId); var room = store.Attach(code, role, token, Context.ConnectionId); await publisher.Publish(room); }
        catch (GameException e) { throw new HubException(e.Message); }
    }
    public async Task Act(string code, HostAction action) {
        try {
            var room = store.Attached(code, Context.ConnectionId);
            if (action.Kind == "delete") {
                lock (room.Gate) {
                    if (room.Connections.GetValueOrDefault(Context.ConnectionId)?.Role != "host")
                        throw new GameException("Only the host can do that.");
                }
                store.Remove(code);
                await publisher.Close(room, "The host closed the room.");
                return;
            }
            store.Act(room, Context.ConnectionId, action);
            await publisher.Publish(room);
        }
        catch (GameException e) { throw new HubException(e.Message); }
    }
    public async Task<bool> Buzz(string code, string roundId) {
        try { var room = store.Attached(code, Context.ConnectionId); var won = store.Buzz(room, Context.ConnectionId, roundId); await publisher.Publish(room); return won; }
        catch (GameException e) { throw new HubException(e.Message); }
    }
    public override async Task OnDisconnectedAsync(Exception? exception) { var room = store.Detach(Context.ConnectionId); if (room is not null) await publisher.Publish(room); await base.OnDisconnectedAsync(exception); }
}
public class GameClock(GameStore store, GamePublisher publisher) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken token) {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(250));
        try { while (await timer.WaitForNextTickAsync(token)) foreach (var room in store.All()) if (store.Expire(room)) await publisher.Publish(room); }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    }
}
