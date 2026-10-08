using System.Security.Cryptography;

namespace Rwd;
public class GameException(string message) : Exception(message);
public record Credentials(string Code, string Token, string? PlayerId = null);
public record Attachment(string Role, string? PlayerId);
public record PlayerView(string Id, string Name, int Score, bool Connected);
public record QuestionView(string Id, string CategoryId, int Value, bool Played, string? Text, string? Answer);
public record CategoryView(string Id, string Name);
public record WagerView(string? PlayerId, string? PlayerName, int Amount, bool Locked);
public record RoomView(string Code, DateTimeOffset ServerNow, long Revision, string Phase, string? QuestionId, string RoundId, string? WinnerId, string? AttemptId, string[] FailedIds, DateTimeOffset? Deadline, CategoryView[] Categories, QuestionView[] Questions, PlayerView[] Players, bool IsHost, WagerView? Wager);
public record QuestionEdit(string QuestionId, string Text, string Answer);
public record ImportedCategory(string Id, string Name);
public record ImportedQuestion(string Id, string CategoryId, int Value, string Text, string Answer);
public record BoardImport(List<ImportedCategory> Categories, List<ImportedQuestion> Questions);
public record HostAction(string Kind, string? QuestionId = null, string? RoundId = null, string? AttemptId = null, bool? Correct = null, string? CategoryId = null, string? Name = null, QuestionEdit? Edit = null, BoardImport? Board = null, string? PlayerId = null, int? WagerAmount = null);
public class Player(string id, string name, string token) { public string Id = id; public string Name = name; public string Token = token; public int Score; }
public class Question(string id, string categoryId, int value, string text, string answer) { public string Id = id; public string CategoryId = categoryId; public int Value = value; public string Text = text; public string Answer = answer; public bool Played; }
public class WagerState(string? playerId, int amount, bool locked) { public string? PlayerId = playerId; public int Amount = amount; public bool Locked = locked; }
public class Room(string code, string hostToken)
{
    public readonly object Gate = new();
    public string Code = code, HostToken = hostToken, Phase = "lobby", RoundId = "";
    public long Revision;
    public string? QuestionId, WinnerId, AttemptId;
    public DateTimeOffset? Deadline;
    public HashSet<string> FailedIds = [];
    public List<Player> Players = [];
    public List<CategoryView> Categories = [];
    public List<Question> Questions = [];
    public Dictionary<string, Attachment> Connections = [];
    public (string PlayerId, int Delta)? LastJudgement;
    public WagerState? Wager;
}
public class GameStore
{
    private readonly object gate = new();
    private readonly Dictionary<string, Room> rooms = new(StringComparer.OrdinalIgnoreCase);
    private static string Token() => Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
    public Credentials Create()
    {
        lock (gate) {
            if (rooms.Count >= 500) throw new GameException("This server is full. Restart it to clear unused rooms.");
            string code;
            const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            do { code = new string(Enumerable.Range(0, 6).Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]).ToArray()); } while (rooms.ContainsKey(code));
            var room = new Room(code, Token()); DemoBoard.Populate(room); rooms.Add(code, room);
            return new(code, room.HostToken);
        }
    }
    public Room Get(string code) { lock (gate) return rooms.GetValueOrDefault(code.Trim()) ?? throw new GameException("Room not found. Check the code."); }
    public Room[] All() { lock (gate) return rooms.Values.ToArray(); }
    public bool Remove(string code) { lock (gate) return rooms.Remove(code.Trim()); }
    public Credentials Join(string code, string name)
    {
        var room = Get(code);
        lock (room.Gate) {
            name = (name ?? "").Trim();
            if (name.Length is < 1 or > 32) throw new GameException("Use a name between 1 and 32 characters.");
            if (room.Phase != "lobby") throw new GameException("This game has started. Ask the host to create a new room.");
            if (room.Players.Count >= 16) throw new GameException("This room already has 16 players.");
            if (room.Players.Any(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase))) throw new GameException("That name is taken. Try another one.");
            var player = new Player(Guid.NewGuid().ToString("N"), name, Token()); room.Players.Add(player); room.Revision++;
            return new(room.Code, player.Token, player.Id);
        }
    }
    public Room Attach(string code, string role, string token, string connectionId)
    {
        var room = Get(code);
        lock (room.Gate) {
            if (role == "host" && token == room.HostToken) room.Connections[connectionId] = new("host", null);
            else if (role == "display") room.Connections[connectionId] = new("display", null);
            else if (role == "player" && room.Players.FirstOrDefault(p => p.Token == token) is { } p) room.Connections[connectionId] = new("player", p.Id);
            else throw new GameException("Your session is invalid. Rejoin the room.");
            room.Revision++; return room;
        }
    }
    public Room? Detach(string connectionId)
    {
        foreach (var room in All()) lock (room.Gate) if (room.Connections.Remove(connectionId)) { room.Revision++; return room; }
        return null;
    }
    public Room Attached(string code, string connectionId)
    {
        var room = Get(code);
        lock (room.Gate) if (!room.Connections.ContainsKey(connectionId)) throw new GameException("Reconnect before continuing.");
        return room;
    }
    public RoomView View(Room room, bool host)
    {
        lock (room.Gate) {
            var wagerView = room.Wager is null ? null : new WagerView(
                room.Wager.PlayerId,
                room.Players.FirstOrDefault(p => p.Id == room.Wager.PlayerId)?.Name,
                room.Wager.Amount,
                room.Wager.Locked
            );
            return new(room.Code, DateTimeOffset.UtcNow, room.Revision, room.Phase, room.QuestionId, room.RoundId, room.WinnerId, room.AttemptId, room.FailedIds.ToArray(), room.Deadline,
                room.Categories.ToArray(), room.Questions.Select(q => new QuestionView(q.Id, q.CategoryId, q.Value, q.Played,
                    host ? q.Text : (room.Phase == "wager_setup" ? null : (q.Id == room.QuestionId ? q.Text : null)),
                    host ? q.Answer : (room.Phase != "wager_setup" && q.Id == room.QuestionId && room.Phase == "revealed" ? q.Answer : null))).ToArray(),
                room.Players.Select(p => new PlayerView(p.Id, p.Name, p.Score, room.Connections.Values.Any(c => c.PlayerId == p.Id))).ToArray(), host, wagerView);
        }
    }
    public void Act(Room room, string connectionId, HostAction action)
    {
        lock (room.Gate) {
            if (room.Connections.GetValueOrDefault(connectionId)?.Role != "host") throw new GameException("Only the host can do that.");
            var q = room.Questions.FirstOrDefault(q => q.Id == room.QuestionId);
            if (action.Kind is "open" or "judge" or "reveal" or "skip" or "undo") {
                if (action.RoundId != room.RoundId || q is null) throw new GameException("That question has changed. Try again.");
            }
            switch (action.Kind) {
                case "start":
                    Require(room.Phase == "lobby", "The game has already started.");
                    Require(room.Players.Any(p => room.Connections.Values.Any(c => c.PlayerId == p.Id)), "Wait for a player to connect first.");
                    room.Phase = "board"; break;
                case "lobby":
                    Require(room.Phase != "lobby", "The game is already in the lobby.");
                    room.Phase = "lobby";
                    room.QuestionId = null;
                    room.WinnerId = null;
                    room.AttemptId = null;
                    room.FailedIds.Clear();
                    room.LastJudgement = null;
                    room.Deadline = null;
                    room.RoundId = "";
                    room.Wager = null;
                    foreach (var question in room.Questions) question.Played = false;
                    foreach (var player in room.Players) player.Score = 0;
                    break;
                case "select":
                    Require(room.Phase == "board", "Return to the board before choosing a question.");
                    q = room.Questions.FirstOrDefault(q => q.Id == action.QuestionId) ?? throw new GameException("Question not found.");
                    Require(!q.Played, "That question has already been played.");
                    room.QuestionId = q.Id; room.RoundId = Token(); room.Phase = "reading"; room.WinnerId = null; room.AttemptId = null; room.FailedIds.Clear(); room.LastJudgement = null; room.Deadline = null; room.Wager = null; break;
                case "wager_init":
                    Require(room.Phase is "board" or "reading", "Return to the board or question reading to start a wager round.");
                    Require(room.Players.Count > 0, "Wait for players to join before starting a wager round.");
                    var unplayed = room.Questions.Where(q => !q.Played).ToList();
                    Require(unplayed.Count > 0, "No unused questions remaining on the board.");
                    var chosenQ = (action.QuestionId != null ? room.Questions.FirstOrDefault(q => q.Id == action.QuestionId && !q.Played) : null)
                        ?? (room.Phase == "reading" && room.QuestionId != null ? room.Questions.FirstOrDefault(q => q.Id == room.QuestionId && !q.Played) : null)
                        ?? unplayed[0];
                    var targetPlayer = (action.PlayerId != null ? room.Players.FirstOrDefault(p => p.Id == action.PlayerId) : null)
                        ?? room.Players.FirstOrDefault(p => room.Connections.Values.Any(c => c.PlayerId == p.Id))
                        ?? room.Players[0];
                    room.QuestionId = chosenQ.Id;
                    room.RoundId = Token();
                    room.Phase = "wager_setup";
                    room.Wager = new WagerState(targetPlayer.Id, 0, false);
                    room.WinnerId = null; room.AttemptId = null; room.FailedIds.Clear(); room.LastJudgement = null; room.Deadline = null; break;
                case "wager_question":
                    Require(room.Phase == "wager_setup", "Question can only be assigned during wager setup.");
                    Require(!string.IsNullOrEmpty(action.QuestionId), "Choose a question.");
                    var qToAssign = room.Questions.FirstOrDefault(q => q.Id == action.QuestionId && !q.Played)
                        ?? throw new GameException("Question not found or already played.");
                    room.QuestionId = qToAssign.Id; break;
                case "wager_player":
                    Require(room.Phase == "wager_setup", "Wager participant can only be changed during setup.");
                    Require(!string.IsNullOrEmpty(action.PlayerId) && room.Players.Any(p => p.Id == action.PlayerId), "Player not found.");
                    room.Wager!.PlayerId = action.PlayerId; break;
                case "wager_cancel":
                    Require(room.Phase == "wager_setup", "No active wager setup to cancel.");
                    room.QuestionId = null; room.Wager = null; room.Phase = "board"; break;
                case "wager_lock":
                    Require(room.Phase == "wager_setup", "No active wager setup to lock.");
                    Require(!string.IsNullOrEmpty(action.PlayerId) && room.Players.Any(p => p.Id == action.PlayerId), "Choose a valid participant.");
                    if (action.WagerAmount is not { } wagerAmount || wagerAmount <= 0) throw new GameException("Wager must be a positive whole number.");
                    if (!string.IsNullOrEmpty(action.QuestionId)) {
                        var qToLock = room.Questions.FirstOrDefault(q => q.Id == action.QuestionId && !q.Played)
                            ?? throw new GameException("Question not found or already played.");
                        room.QuestionId = qToLock.Id;
                    }
                    Require(room.QuestionId != null, "No question assigned.");
                    var participant = room.Players.Single(p => p.Id == action.PlayerId);
                    room.Wager!.PlayerId = participant.Id;
                    room.Wager.Amount = wagerAmount;
                    room.Wager.Locked = true;
                    room.RoundId = Token();
                    room.Phase = "reading";
                    room.WinnerId = null; room.AttemptId = null; room.FailedIds.Clear(); room.LastJudgement = null; room.Deadline = null; break;
                case "floor":
                    Require(room.Phase is "reading" or "open" or "expired", "Cannot give floor now.");
                    Require(room.Wager is not null, "Only available in a wager round.");
                    room.WinnerId = room.Wager!.PlayerId;
                    room.AttemptId = Token();
                    room.Phase = "answering";
                    room.Deadline = null; break;
                case "open":
                    Require(room.Phase is "reading" or "wrong" or "expired", "Buzzers cannot open now.");
                    Require(room.Players.Any(p => room.Connections.Values.Any(c => c.PlayerId == p.Id)), "No connected players. Reveal or skip the question.");
                    room.Phase = "open"; room.WinnerId = null; room.AttemptId = null; room.LastJudgement = null; room.Deadline = DateTimeOffset.UtcNow.AddSeconds(30); break;
                case "judge":
                    Require(room.Phase == "answering" && room.AttemptId == action.AttemptId && action.Correct.HasValue, "That answer has already been judged.");
                    var winner = room.Players.Single(p => p.Id == room.WinnerId);
                    int pointValue = room.Wager is not null ? room.Wager.Amount : q!.Value;
                    int delta = action.Correct == true ? pointValue : -pointValue;
                    winner.Score += delta; room.LastJudgement = (winner.Id, delta);
                    if (action.Correct == true) { q!.Played = true; room.Phase = "resolved"; }
                    else { if (room.Wager is not null) q!.Played = true; room.Phase = "wrong"; }
                    break;
                case "undo":
                    Require(room.Phase is "wrong" or "resolved" && room.LastJudgement.HasValue, "There is no judgement to undo.");
                    var judgement = room.LastJudgement!.Value;
                    room.Players.Single(p => p.Id == judgement.PlayerId).Score -= judgement.Delta;
                    q!.Played = false; room.Phase = "answering"; room.AttemptId = Token(); room.LastJudgement = null; break;
                case "reveal": case "skip":
                    Require(room.Phase is "reading" or "open" or "answering" or "wrong" or "resolved" or "expired", "The answer is already revealed.");
                    q!.Played = true; room.Phase = "revealed"; room.Deadline = null; room.LastJudgement = null; break;
                case "board":
                    Require(room.Phase == "revealed", "Reveal the answer before returning to the board.");
                    room.Phase = room.Questions.All(q => q.Played) ? "finished" : "board";
                    room.QuestionId = null; room.WinnerId = null; room.AttemptId = null; room.FailedIds.Clear(); room.Wager = null; break;
                case "category":
                    Require(room.Phase is "lobby" or "board", "Rename categories from the board.");
                    var index = room.Categories.FindIndex(c => c.Id == action.CategoryId);
                    Require(index >= 0 && !string.IsNullOrWhiteSpace(action.Name) && action.Name.Length <= 32, "Use a category name between 1 and 32 characters.");
                    room.Categories[index] = room.Categories[index] with { Name = action.Name!.Trim() }; break;
                case "edit":
                    Require(room.Phase is "lobby" or "board" or "reading", "Edit questions before opening the buzzers.");
                    var edit = action.Edit ?? throw new GameException("Enter a question and answer.");
                    var editable = room.Questions.FirstOrDefault(q => q.Id == edit.QuestionId) ?? throw new GameException("Question not found.");
                    Require(!editable.Played && (room.Phase != "reading" || editable.Id == room.QuestionId), "That question cannot be edited now.");
                    Require(!string.IsNullOrWhiteSpace(edit.Text) && edit.Text.Length <= 600 && !string.IsNullOrWhiteSpace(edit.Answer) && edit.Answer.Length <= 300, "Enter a question (up to 600 characters) and answer (up to 300).");
                    editable.Text = edit.Text.Trim(); editable.Answer = edit.Answer.Trim(); break;
                case "import_board":
                    Require(room.Phase is "lobby" or "board", "Import questions from the lobby or before starting questions.");
                    Require(room.Questions.All(q => !q.Played), "Cannot import while questions are already played.");
                    var board = action.Board ?? throw new GameException("No board data provided.");
                    Require(board.Categories.Count is >= 1 and <= 10, "Provide between 1 and 10 categories.");
                    Require(board.Questions.Count is >= 1 and <= 100, "Provide valid questions.");
                    room.Categories.Clear();
                    foreach (var cat in board.Categories)
                    {
                        var name = (cat.Name ?? "").Trim();
                        if (string.IsNullOrWhiteSpace(name)) name = "Untitled";
                        if (name.Length > 32) name = name[..32];
                        room.Categories.Add(new(cat.Id, name));
                    }
                    room.Questions.Clear();
                    foreach (var qData in board.Questions)
                    {
                        var text = (qData.Text ?? "").Trim();
                        var answer = (qData.Answer ?? "").Trim();
                        if (string.IsNullOrWhiteSpace(text)) text = "Question";
                        if (string.IsNullOrWhiteSpace(answer)) answer = "Answer";
                        if (text.Length > 600) text = text[..600];
                        if (answer.Length > 300) answer = answer[..300];
                        room.Questions.Add(new(qData.Id, qData.CategoryId, qData.Value > 0 ? qData.Value : 100, text, answer));
                    }
                    break;
                default: throw new GameException("Unknown action.");
            }
            room.Revision++;
        }
    }
    public bool Buzz(Room room, string connectionId, string roundId)
    {
        lock (room.Gate) {
            var attachment = room.Connections.GetValueOrDefault(connectionId);
            Require(attachment?.Role == "player", "Join as a player to buzz.");
            if (room.RoundId != roundId || room.Phase != "open") return false;
            if (room.Deadline <= DateTimeOffset.UtcNow) { room.Phase = "expired"; room.Deadline = null; room.Revision++; return false; }
            if (room.Wager is not null && attachment!.PlayerId != room.Wager.PlayerId) return false;
            room.WinnerId = attachment!.PlayerId; room.AttemptId = Token(); room.Phase = "answering"; room.Deadline = null; room.Revision++; return true;
        }
    }
    public bool Expire(Room room)
    {
        lock (room.Gate) {
            if (room.Phase != "open" || room.Deadline > DateTimeOffset.UtcNow) return false;
            room.Phase = "expired"; room.Deadline = null; room.Revision++; return true;
        }
    }
    private static void Require(bool condition, string message) { if (!condition) throw new GameException(message); }
}
