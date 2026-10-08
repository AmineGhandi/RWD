using Microsoft.AspNetCore.RateLimiting;
using Rwd;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR(o => { o.EnableDetailedErrors = false; o.MaximumReceiveMessageSize = 16 * 1024; });
builder.Services.AddSingleton<GameStore>();
builder.Services.AddSingleton<GamePublisher>();
builder.Services.AddHostedService<GameClock>();
builder.Services.AddRateLimiter(o => o.AddPolicy("rooms", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })));
var app = builder.Build();
app.UseRateLimiter();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapPost("/api/rooms", (GameStore store) => {
    try { return Results.Ok(store.Create()); }
    catch (GameException e) { return Results.BadRequest(new { error = e.Message }); }
}).RequireRateLimiting("rooms");
app.MapPost("/api/rooms/{code}/players", (string code, JoinRequest request, GameStore store) => {
    try { return Results.Ok(store.Join(code, request.Name)); }
    catch (GameException e) { return Results.BadRequest(new { error = e.Message }); }
}).RequireRateLimiting("rooms");
app.MapDelete("/api/rooms/{code}", async (string code, HttpRequest request, GameStore store, GamePublisher publisher) => {
    try {
        var token = request.Headers["X-Host-Token"].ToString();
        var room = store.Get(code);
        if (room.HostToken != token) return Results.Unauthorized();
        store.Remove(code);
        await publisher.Close(room, "The host closed the room.");
        return Results.Ok();
    }
    catch (GameException e) { return Results.BadRequest(new { error = e.Message }); }
}).RequireRateLimiting("rooms");
app.MapHub<GameHub>("/game");
app.MapFallbackToFile("index.html");
app.Run();
public record JoinRequest(string Name);
