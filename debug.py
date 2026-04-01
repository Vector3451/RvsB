import logging, traceback, sys
from agents.red_team import IntelligentRedAgent
from agents.rl.ppo_agent import PPOPolicy

logging.basicConfig(level=logging.DEBUG)

def main():
    try:
        print("Initializing Policy...")
        policy = PPOPolicy(role="red", save_path="agents/rl/red_policy.json")
        print(f"Policy params: W={policy.W.shape}")
        
        print("Initializing Agent...")
        agent = IntelligentRedAgent('http://localhost:7860', 10)
        
        print("Running Episode...")
        res = agent.run_episode('Test')
        print(f"Success! Reward: {res['avg_reward']}")
    except Exception as e:
        print("CRASHED!")
        traceback.print_exc(file=sys.stdout)

if __name__ == "__main__":
    main()
